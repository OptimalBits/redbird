"use strict";

var Redbird = require('../');
var expect = require('chai').expect;
var Promise = require('bluebird');

var opts = {
	bunyan: false /* {
		name: 'test',
		streams: [{
        	path: '/dev/null',
    	}]
	} */
}

describe("Route registration", function () {
	it("should register a simple route", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');

		expect(redbird.routing).to.have.property("example.com")

		return redbird.resolve('example.com').then(function (result) {
			expect(result).to.be.an("object");

			var host = redbird.routing["example.com"];
			expect(host).to.be.an("array");
			expect(host[0]).to.have.property('path')
			expect(host[0].path).to.be.eql('/');
			expect(host[0].urls).to.be.an('array');
			expect(host[0].urls.length).to.be.eql(1);
			expect(host[0].urls[0].href).to.be.eql('http://192.168.1.2:8080/');

			redbird.unregister('example.com', '192.168.1.2:8080');

			return redbird.resolve('example.com');
			
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")
			redbird.close();
		});
	});

	it("should resolve domains as case insensitive", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');

		return redbird.resolve('Example.com').then(function (target) {
			expect(target).to.be.an("object");
			expect(target.urls[0].hostname).to.be.equal('192.168.1.2');
	
			redbird.close();
		});
	});


	it("should register multiple routes", function () {
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

		return redbird.resolve('example1.com').then(function (result) {
			expect(result).to.be.an("undefined")

			redbird.unregister('example2.com');
			return redbird.resolve('example2.com');
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")

			redbird.unregister('example3.com');
			return redbird.resolve('example3.com');
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")

			redbird.unregister('example4.com');
			return redbird.resolve('example4.com');
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")

			redbird.unregister('example5.com');
			return redbird.resolve('example5.com');
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")
			redbird.close();
		})

	})
	it("should register several pathnames within a route", function () {
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
		return redbird.resolve('example.com').then(function (result) {
			expect(result).to.be.an("undefined")
			return redbird.resolve('example.com', '/foo');
		})
		.then(function (result) {
			expect(result).to.be.an("object")

			redbird.unregister('example.com/foo');
			return redbird.resolve('example.com', '/foo');
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")
			
			redbird.close();
		});
	})
	it("shouldnt crash process in unregister of unregisted host", function (done) {
		var redbird = Redbird(opts);

		redbird.unregister('example.com');

		done()

		redbird.close();
	})
})

describe("Route resolution", function () {
	it("should resolve to a correct route", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('example.com/bar', '192.168.1.4:8080');
		redbird.register('example.com/foo/baz', '192.168.1.3:8080');

		return redbird.resolve('example.com', '/foo/asd/1/2').then(function (route) {
			expect(route.path).to.be.eql('/foo')
			expect(route.urls.length).to.be.eql(1);
			expect(route.urls[0].href).to.be.eql('http://192.168.1.3:8080/');
	
			redbird.close();
		});
	})

	it("should resolve to a correct route with complex path", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('example.com/bar', '192.168.1.4:8080');
		redbird.register('example.com/foo/baz', '192.168.1.7:8080');

		return redbird.resolve('example.com', '/foo/baz/a/b/c').then(function (route) {
			expect(route.path).to.be.eql('/foo/baz')
			expect(route.urls.length).to.be.eql(1);
			expect(route.urls[0].href).to.be.eql('http://192.168.1.7:8080/');
	
			redbird.close();
		});
	})

	it("should resolve to undefined if route not available", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('foobar.com/bar', '192.168.1.4:8080');
		redbird.register('foobar.com/foo/baz', '192.168.1.3:8080');

		return redbird.resolve('wrong.com').then(function (route) {
			expect(route).to.be.an('undefined')

			return redbird.resolve('foobar.com');
		})
		.then(function (route) {
			expect(route).to.be.an('undefined')

			redbird.close();
		});
	})

	it("should get a target if route available", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080');
		redbird.register('foobar.com/bar', '192.168.1.4:8080');
		redbird.register('foobar.com/foo/baz', '192.168.1.7:8080');
		redbird.register('foobar.com/media', '192.168.1.7:8080');

		return redbird.resolve('example.com', '/qux/a/b/c').then(function (route) {
			expect(route.path).to.be.eql('/');

			return redbird.resolve('foobar.com', '/medias/');
		})
		.then(function (route) {
			expect(route).to.be.undefined;

			return redbird.resolve('foobar.com', '/mediasa');
		})
		.then(function (route) {
			expect(route).to.be.undefined;
			return redbird.resolve('foobar.com', '/media/sa');
		})
		.then(function (route) {
			expect(route.path).to.be.eql('/media');

			return redbird._getTarget('example.com', { url: '/foo/baz/a/b/c' });
		})
		.then(function (target) {
			expect(target.href).to.be.eql('http://192.168.1.3:8080/')

			redbird.close();
		});
	})

	it("should get a target with path when necessary", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com/qux/baz', '192.168.1.5:8080');
		redbird.register('example.com/foo', '192.168.1.3:8080/a/b');
		redbird.register('foobar.com/bar', '192.168.1.4:8080');
		redbird.register('foobar.com/foo/baz', '192.168.1.7:8080');

		var req = { url: '/foo/baz/a/b/c' }
		return redbird.resolve('example.com', '/qux/a/b/c').then(function (route) {
			expect(route.path).to.be.eql('/');
			
			return redbird._getTarget('example.com', req);
		})
		.then(function (target) {
			expect(target.href).to.be.eql('http://192.168.1.3:8080/a/b')
			expect(req.url).to.be.eql('/a/b/baz/a/b/c')
	
			redbird.close();
		});
	})
})

describe("TLS/SSL", function () {
	it("should allow TLS/SSL certificates", function () {
		var redbird = Redbird({
			ssl: {
				port: 4430
			},
			bunyan: false
		});

		expect(redbird.routing).to.be.an("object");
		redbird.register('example.com', '192.168.1.1:8080', {
			ssl: {
				key: 'dummy',
				cert: 'dummy'
			}
		});

		redbird.register('example.com', '192.168.1.2:8080');

		expect(redbird.certs).to.be.an("object");
		expect(redbird.certs['example.com']).to.be.an("object");

		redbird.unregister('example.com', '192.168.1.1:8080');

		return redbird.resolve('example.com').then(function (result) {
			expect(result).to.not.be.an("undefined")
			expect(redbird.certs['example.com']).to.not.be.an("undefined");
			redbird.unregister('example.com', '192.168.1.2:8080');

			return redbird.resolve('example.com');
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")
			expect(redbird.certs['example.com']).to.be.an("undefined");
		});

	})
	it('Should bind https servers to different ip addresses', function(testDone) {

		var isPortTaken = function(port, ip, done) {
		  var net = require('net')
		  var tester = net.createServer()
		  .once('error', function (err) {
		    if (err.code != 'EADDRINUSE') return done(err)
		    done(null, true)
		  })
		  .once('listening', function() {
		    tester.once('close', function() { done(null, false) })
		    .close()
		  })
		  .listen(port, ip)
		}

		var redbird = Redbird({
		    bunyan: false,
			port: 8080,

		    // Specify filenames to default SSL certificates (in case SNI is not supported by the
		    // user's browser)
		    ssl: [
				{
					port: 4433,
					key: 'dummy',
					cert: 'dummy',
					ip: '127.0.0.1'
				},
				{
					port: 4434,
					key: 'dummy',
					cert: 'dummy',
					ip: '127.0.0.1'
				}
		    ]
		});

		redbird.register('mydomain.com', 'http://127.0.0.1:8001', {
			ssl: {
				key: 'dummy',
				cert: 'dummy',
				ca: 'dummym'
			}
		});

		var portsTaken = 0;
		var portsChecked = 0;

		function portsTakenDone(err, taken) {
			portsChecked++;
			if (err) { throw err; }
			if (taken) { portsTaken++; }
			if ( portsChecked == 2 ) {
				portsCheckDone();
			}
		}

		function portsCheckDone() {
			expect(portsTaken).to.be.eql(2);
			redbird.close();
			testDone();
		}

		isPortTaken(4433, '127.0.0.1', portsTakenDone);
		isPortTaken(4434, '127.0.0.1', portsTakenDone);
	});
})


describe("Load balancing", function () {
	it("should load balance between several targets", function () {
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('example.com', '192.168.1.1:8080');
		redbird.register('example.com', '192.168.1.2:8080');
		redbird.register('example.com', '192.168.1.3:8080');
		redbird.register('example.com', '192.168.1.4:8080');

		expect(redbird.routing['example.com'][0].urls.length).to.be.eql(4);
		expect(redbird.routing['example.com'][0].rr).to.be.eql(0);

		
		return redbird.resolve('example.com', '/foo/qux/a/b/c').then(function (route) {
			expect(route.urls.length).to.be.eql(4);

			return Promise.each(Array(1000).fill(null), function () {
				return redbird._getTarget('example.com', { url: '/a/b/c' }).then(function (target) {
					expect(target.href).to.be.eql('http://192.168.1.1:8080/')
					expect(redbird.routing['example.com'][0].rr).to.be.eql(1);

					return redbird._getTarget('example.com', { url: '/x/y' });
				})
				.then(function (target) {
					expect(target.href).to.be.eql('http://192.168.1.2:8080/')
					expect(redbird.routing['example.com'][0].rr).to.be.eql(2);

					return redbird._getTarget('example.com', { url: '/j' });
				})
				.then(function (target) {
					expect(target.href).to.be.eql('http://192.168.1.3:8080/')
					expect(redbird.routing['example.com'][0].rr).to.be.eql(3);

					return redbird._getTarget('example.com', { url: '/k/' });
				})
				.then(function (target) {
					expect(target.href).to.be.eql('http://192.168.1.4:8080/')
					expect(redbird.routing['example.com'][0].rr).to.be.eql(0);
				});
			});
		})
		.then(function () {
			redbird.unregister('example.com', '192.168.1.1:8080');
			return redbird.resolve('example.com');
		})
		.then(function (result) {
			expect(result).to.not.be.an("undefined")

			redbird.unregister('example.com', '192.168.1.2:8080');
			return redbird.resolve('example.com');
		})
		.then(function (result) {
			expect(result).to.not.be.an("undefined")
			redbird.unregister('example.com', '192.168.1.3:8080');

			return redbird.resolve('example.com');
		})
		.then(function (result) {
			expect(result).to.not.be.an("undefined")
			redbird.unregister('example.com', '192.168.1.4:8080');

			return redbird.resolve('example.com');
		})
		.then(function (result) {
			expect(result).to.be.an("undefined")

			redbird.close();
		})
	});
});
