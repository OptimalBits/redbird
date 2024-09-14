import { describe, it, expect } from 'vitest';
import { Redbird, buildRoute } from '../lib/index.js'; // Adjust the import path if necessary
import { ResolverFn } from '../lib/interfaces/proxy-options.js';
import { IncomingMessage } from 'http';
import { ProxyRoute } from '../lib/interfaces/proxy-route.js';

const opts = {
  port: 10000 + Math.ceil(Math.random() * 55535),
  // Additional comment for clarity or additional options
};

describe('Custom Resolver', () => {
  it('Should contain one resolver by default', async () => {
    const redbird = new Redbird(opts);
    expect(redbird.resolvers).toBeInstanceOf(Array);
    expect(redbird.resolvers).toHaveLength(1);
    expect(redbird.resolvers[0]).toEqual(redbird.defaultResolver);

    await redbird.close();
  });

  it('Should register resolver with right priority', async () => {
    const resolver = {
      fn: (host: string, url: string) => 'http://127.0.0.1:8080',
      priority: 1,
    };

    let options = { ...opts, resolvers: [resolver] };
    let redbird = new Redbird(options);

    expect(redbird.resolvers).toHaveLength(2);
    expect(redbird.resolvers[0]).toEqual(resolver);

    await redbird.close();

    resolver.priority = -1;
    redbird = new Redbird({ ...options, resolvers: [resolver] });
    expect(redbird.resolvers[1]).toEqual(resolver);

    await redbird.close();
  });

  it('Should add and remove resolver after launch', async () => {
    const resolverFn: ResolverFn = (host: string, url: string, req?: IncomingMessage) => '';

    const redbird = new Redbird(opts);
    redbird.addResolver(resolverFn, 1);
    expect(redbird.resolvers).toHaveLength(2);
    expect(redbird.resolvers[0].fn).toEqual(resolverFn);

    redbird.addResolver(resolverFn);
    expect(redbird.resolvers).toHaveLength(2); // Only allows uniques.

    redbird.removeResolver(resolverFn);
    expect(redbird.resolvers).toHaveLength(1);
    expect(redbird.resolvers[0]).toEqual(redbird.defaultResolver);

    await redbird.close();
  });

  it('Should properly convert and cache route to routeObject', () => {
    const builder = buildRoute;

    // Invalid input
    expect(builder(<any>(() => {}))).toBeNull();
    expect(builder(<any>[])).toBeNull();
    expect(builder(<any>2016)).toBeNull();

    const testRoute = { urls: [], path: '/' };
    const testRouteResult = builder(testRoute);
    expect(testRouteResult).toEqual(testRoute);

    if (testRouteResult) {
      expect(testRouteResult.urls).toBeDefined();
      expect(testRouteResult.urls).toHaveLength(0);
    } else {
      throw new Error('testRouteResult is not defined');
    }

    // Case string:
    const testString = 'http://127.0.0.1:8888';
    const result = builder(testString) as ProxyRoute;
    expect(result.path).toEqual('/');
    expect(result.urls).toBeInstanceOf(Array);
    expect(result.urls?.length).toEqual(1);

    if (result.urls) {
      expect(result.urls[0].hostname).toEqual('127.0.0.1');
    } else {
      throw new Error('urls is not defined');
    }

    expect(result.isResolved).toBeTruthy();

    const result2 = builder(testString);
    expect(result2).toEqual(result);

    // Case with object
    const testObject_1 = { path: '/api', url: 'http://127.0.0.1' };
    const testObjectResult_1 = builder(testObject_1) as ProxyRoute;

    expect(testObjectResult_1.path).toEqual('/api');
    expect(testObjectResult_1.urls).toBeInstanceOf(Array);

    if (testObjectResult_1.urls) {
      expect(testObjectResult_1.urls.length).toEqual(1);
      expect(testObjectResult_1.urls[0].hostname).toEqual('127.0.0.1');
    } else {
      throw new Error('urls is not defined');
    }

    expect(testObjectResult_1.isResolved).toBeTruthy();

    // Test object caching.
    const testObjectResult_2 = builder(testObject_1);
    expect(testObjectResult_1).toEqual(testObjectResult_2);

    const testObject_2 = { url: ['http://127.0.0.1', 'http://123.1.1.1'] };
    const testResult2 = builder(<any>testObject_2);
    expect(testResult2!.urls).toBeDefined();
    expect(testResult2!.urls!.length).toEqual(testObject_2.url.length);
    expect(testResult2!.urls![0].hostname).toEqual('127.0.0.1');
    expect(testResult2!.urls![1].hostname).toEqual('123.1.1.1');
  });

  it('Should resolve properly as expected', async () => {
    const proxy = new Redbird(opts);
    const resolverFn = function (host: string, url: string) {
      return url.match(/\/ignore/i) ? null : 'http://172.12.0.1/home';
    };

    proxy.register('mysite.example.com', 'http://127.0.0.1:9999');
    proxy.addResolver(resolverFn, 1);

    // must match the resolver
    const result = await proxy.resolve('randomsite.example.com', '/anywhere');

    expect(result).to.not.be.null;
    expect(result).to.not.be.undefined;
    expect(result!.urls!.length).to.be.above(0);
    expect(result!.urls![0].hostname).to.be.eq('172.12.0.1');

    // expect route to match resolver even though it matches registered address
    const result2 = await proxy.resolve('mysite.example.com', '/somewhere');
    expect(result2!.urls![0].hostname).to.be.eq('172.12.0.1');

    // use default resolver, as custom resolver should ignore input.
    const result3 = await proxy.resolve('mysite.example.com', '/ignore');
    expect(result3!.urls![0].hostname).to.be.eq('127.0.0.1');

    // make custom resolver low priority and test.
    // result should match default resolver
    proxy.addResolver(resolverFn, -1);
    const result4 = await proxy.resolve('mysite.example.com', '/somewhere');
    expect(result4!.urls![0].hostname).to.be.eq('127.0.0.1');

    // both custom and default resolvers should ignore
    const result5 = await proxy.resolve('somesite.example.com', '/ignore');
    expect(result5).to.be.undefined;
    proxy.removeResolver(resolverFn);

    // for path-based routing
    // when resolver path doesn't match that of url, skip

    const resolverPath = function (host: string, url: string) {
      return {
        path: '/notme',
        url: 'http://172.12.0.1/home',
      };
    };
    proxy.addResolver(resolverPath, 1);

    const result6 = await proxy.resolve('somesite.example.com', '/notme');

    expect(result6).to.not.be.undefined;
    expect(result6!.urls![0].hostname).to.be.eq('172.12.0.1');

    const result7 = await proxy.resolve('somesite.example.com', '/notme/somewhere');
    expect(result7!.urls![0].hostname).to.be.eq('172.12.0.1');

    const result8 = await proxy.resolve('somesite.example.com', '/itsme/somewhere');
    expect(result8).to.be.undefined;
    await proxy.close();
  });

  it('Should resolve array properly as expected', function () {
    const proxy = new Redbird(opts);

    const firstResolver = function (host: string, url: string) {
      if (url.endsWith('/first-resolver')) {
        return 'http://first-resolver/';
      }
    };
    firstResolver.priority = 2;

    const secondResolver = function (host: string, url: string) {
      return new Promise<string | null>(function (resolve, reject) {
        if (url.endsWith('/second-resolver')) {
          resolve('http://second-resolver/');
        } else {
          resolve(null);
        }
      });
    };
    secondResolver.priority = 1;

    proxy.resolvers = []; // remove the defaultResolver
    proxy.addResolver(firstResolver);
    proxy.addResolver(secondResolver);

    const cases = [
      proxy.resolve('mysite.example.com', '/first-resolver').then(function (result) {
        expect(result!.urls!.length).to.be.above(0);
        expect(result!.urls![0].hostname).to.be.eq('first-resolver');
      }),
      proxy.resolve('mysite.example.com', '/second-resolver').then(function (result) {
        expect(result!.urls!.length).to.be.above(0);
        expect(result!.urls![0].hostname).to.be.eq('second-resolver');
      }),
    ];

    return Promise.all(cases).then(
      () => proxy.close(),
      (err) => {
        proxy.close();
        throw err;
      }
    );
  });
});
