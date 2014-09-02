var Redbird = require('../');
var expect = require('chai').expect;

var opts = {
	bunyan: false /* {
		name: 'test',
		streams: [{
        	path: '/dev/null',
    	}]
	} */
}

describe("Route registration", function(){
	it("should register a simple route", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');

		expect(redbird.routing).to.have.property("example.com")

		var host = redbird.routing["example.com"];
		expect(host).to.be.an("array");
		expect(host[0]).to.have.property('path')
		expect(host[0].path).to.be.eql('/');
		expect(host[0].urls).to.be.an('array');
		expect(host[0].urls.length).to.be.eql(1);
		expect(host[0].urls[0].href).to.be.eql('http://192.168.1.2:8080/');

		redbird.unregister('example.com', '192.168.1.2:8080');
		expect(redbird.resolve('example.com')).to.be.an("undefined")

		redbird.close();
	})
	it("should register multiple routes", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example1.com', '192.168.1.2:8080');
		redbird.register('example2.com', '192.168.1.3:8081');
		redbird.register('example3.com', '192.168.1.4:8082');
		redbird.register('example4.com', '192.168.1.5:8083');
		redbird.register('example5.com', '192.168.1.6:8084');

		expect(redbird.routing).to.have.property("example1.com")
		expect(redbird.routing).to.have.property("example2.com")
		expect(redbird.routing).to.have.property("example3.com")
		expect(redbird.routing).to.have.property("example4.com")
		expect(redbird.routing).to.have.property("example5.com")

		var host;

		host = redbird.routing["example1.com"];
		expect(host[0].path).to.be.eql('/');
		expect(host[0].urls[0].href).to.be.eql('http://192.168.1.2:8080/');

		host = redbird.routing["example2.com"];
		expect(host[0].path).to.be.eql('/');
		expect(host[0].urls[0].href).to.be.eql('http://192.168.1.3:8081/');

		host = redbird.routing["example3.com"];
		expect(host[0].path).to.be.eql('/');
		expect(host[0].urls[0].href).to.be.eql('http://192.168.1.4:8082/');

		host = redbird.routing["example4.com"];
		expect(host[0].path).to.be.eql('/');
		expect(host[0].urls[0].href).to.be.eql('http://192.168.1.5:8083/');

		host = redbird.routing["example5.com"];
		expect(host[0].path).to.be.eql('/');
		expect(host[0].urls[0].href).to.be.eql('http://192.168.1.6:8084/');

		redbird.unregister('example1.com');
		expect(redbird.resolve('example1.com')).to.be.an("undefined")

		redbird.unregister('example2.com');
		expect(redbird.resolve('example2.com')).to.be.an("undefined")

		redbird.unregister('example3.com');
		expect(redbird.resolve('example3.com')).to.be.an("undefined")

		redbird.unregister('example4.com');
		expect(redbird.resolve('example4.com')).to.be.an("undefined")

		redbird.unregister('example5.com');
		expect(redbird.resolve('example5.com')).to.be.an("undefined")


		redbird.close();
	})
	it("should register several pathnames within a route", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('example.com/bar', '192.168.1.4:8080');
		
		expect(redbird.routing).to.have.property("example.com")

		var host = redbird.routing["example.com"];
		expect(host).to.be.an("array");
		expect(host[0]).to.have.property('path')
		expect(host[0].path).to.be.eql('/qux/baz');
		expect(host[0].urls).to.be.an('array');
		expect(host[0].urls.length).to.be.eql(1);
		expect(host[0].urls[0].href).to.be.eql('http://192.168.1.5:8080/');

		expect(host[0].path.length).to.be.least(host[1].path.length)
		expect(host[1].path.length).to.be.least(host[2].path.length)
		expect(host[2].path.length).to.be.least(host[3].path.length)

		redbird.unregister('example.com');
		expect(redbird.resolve('example.com')).to.be.an("undefined")

		expect(redbird.resolve('example.com', '/foo')).to.be.an("object")

		redbird.unregister('example.com/foo');
		expect(redbird.resolve('example.com', '/foo')).to.be.an("undefined")

		redbird.close();
	})
})

describe("Route resolution", function(){
	it("should resolve to a correct route", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('example.com/bar', '192.168.1.4:8080');
	    redbird.register('example.com/foo/baz', '192.168.1.3:8080');

		var route = redbird.resolve('example.com', '/foo/asd/1/2');
		expect(route.path).to.be.eql('/foo')
		expect(route.urls.length).to.be.eql(1);
		expect(route.urls[0].href).to.be.eql('http://192.168.1.3:8080/');

		redbird.close();
	})

	it("should resolve to a correct route with complex path", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('example.com/bar', '192.168.1.4:8080');
	    redbird.register('example.com/foo/baz', '192.168.1.7:8080');

		var route = redbird.resolve('example.com', '/foo/baz/a/b/c');

		expect(route.path).to.be.eql('/foo/baz')
		expect(route.urls.length).to.be.eql(1);
		expect(route.urls[0].href).to.be.eql('http://192.168.1.7:8080/');

		redbird.close();
	})

	it("should resolve to undefined if route not available", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('foobar.com/bar', '192.168.1.4:8080');
	    redbird.register('foobar.com/foo/baz', '192.168.1.3:8080');

		var route = redbird.resolve('wrong.com');
		expect(route).to.be.an('undefined')

		var route = redbird.resolve('foobar.com');
		expect(route).to.be.an('undefined')

		redbird.close();
	})

	it("should get a target if route available", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('foobar.com/bar', '192.168.1.4:8080');
	    redbird.register('foobar.com/foo/baz', '192.168.1.7:8080');

	    var route = redbird.resolve('example.com', '/qux/a/b/c');
	    expect(route.path).to.be.eql('/');

		var target = redbird._getTarget('example.com', {url: '/foo/baz/a/b/c'});
		expect(target.href).to.be.eql('http://192.168.1.3:8080/')

		redbird.close();
	})

	it("should get a target with path when necessary", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080/a/b');
		redbird.register('foobar.com/bar', '192.168.1.4:8080');
	    redbird.register('foobar.com/foo/baz', '192.168.1.7:8080');

	    var route = redbird.resolve('example.com', '/qux/a/b/c');
	    expect(route.path).to.be.eql('/');

	    var req = {url: '/foo/baz/a/b/c'}
		var target = redbird._getTarget('example.com', req);
		expect(target.href).to.be.eql('http://192.168.1.3:8080/a/b')
		expect(req.url).to.be.eql('/a/b/baz/a/b/c')

		redbird.close();
	})
})

describe("Load balancing", function(){
	it("should load balance between several targets", function(){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.1:8080');
		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com', '192.168.1.3:8080');
		redbird.register('example.com', '192.168.1.4:8080');

		expect(redbird.routing['example.com'][0].urls.length).to.be.eql(4);
		expect(redbird.routing['example.com'][0].rr).to.be.eql(0);

	    var route = redbird.resolve('example.com', '/foo/qux/a/b/c');
	    expect(route.urls.length).to.be.eql(4);

	    for(var i=0; i<1000; i++){
	    	var target = redbird._getTarget('example.com', {url: '/a/b/c'});
			expect(target.href).to.be.eql('http://192.168.1.1:8080/')
			expect(redbird.routing['example.com'][0].rr).to.be.eql(1);
			
			var target = redbird._getTarget('example.com', {url: '/x/y'});
			expect(target.href).to.be.eql('http://192.168.1.2:8080/')
			expect(redbird.routing['example.com'][0].rr).to.be.eql(2);
			
			var target = redbird._getTarget('example.com', {url: '/j'});
			expect(target.href).to.be.eql('http://192.168.1.3:8080/')
			expect(redbird.routing['example.com'][0].rr).to.be.eql(3);
			
			var target = redbird._getTarget('example.com', {url: '/k/'});
			expect(target.href).to.be.eql('http://192.168.1.4:8080/')
			expect(redbird.routing['example.com'][0].rr).to.be.eql(0);
	    }

		redbird.close();	
	});
});


