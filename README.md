redbird
=======

A reverse proxy for nodejs with load balancer and support for dynamic proxy tables based on redis or etcd.

This light weight package includes everything you need for easy reverse routing of your applications.
Great for routing many applications from different domains in one single host.

Why?
====

Because http-proxy is great byt using directly is cumbersome and error prone. With redbird you get a complete
easy to use dynamic reverse proxy with the speed and robustness of http-proxy.


Manual routing example
======================

You can manually register or unregister routes dynamically.

```
var Redbird = require('redbird');

var proxy = new Redbird({port: 80});

// Route to any global ip
proxy.register("optimalbits.com", "http://167.23.42.67:8000");

// Route to any local ip, for example from docker containers.
proxy.register("example.com", "http://172.17.42.1:8001");
proxy.register("example.com/static", "http://172.17.42.1:8002");
proxy.register("example.com/media", "http://172.17.42.1:8003");

proxy.register("abc.example.com", "http://172.17.42.4:8080");
proxy.register("abc.example.com/media", "http://172.17.42.5:8080");

// Route to any href including path
proxy.register("foobar.example.com", "http://172.17.42.6:8080/foobar");

// Filter requests
proxy.register("qux.example.com", "http://172.17.42.7:8080", {allow: ['180.4.7.0/12', '145.7.6.1']});


````

Features
========

- Flexible and easy routing.
- Load balancer.
- Websockets.
- SSL Support.
- Specify routes manually or automatically via redis or etcd backend.
- Simple IP Filtering.
- Optional logging based on bunyan.


