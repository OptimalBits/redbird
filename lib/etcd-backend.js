/*eslint-env node */
'use strict';

/**
 Redbird ETCD Module
 This module handles automatic proxy registration via etcd
 */
var Etcd = require('node-etcd');
var _ = require('lodash');

function ETCDModule(redbird, options) {
    if (!(this instanceof ETCDModule)) {
        return new ETCDModule(redbird, options);
    }

    // Create Redbird Instance and Log
    this.redbird = redbird;
    var log = redbird.log;
    var _this = this;

    // Create node-etcd Instance
    this.etcd = new Etcd(options.hosts, options.ssloptions);
    this.etcd_dir = (typeof options.path !== 'undefined') ? options.path : "redbird";

    // Create directory if not created
    this.etcd.get(this.etcd_dir, function (err, body, header) {
        if (err && err.errorCode == 100) {
            _this.etcd.mkdir(_this.etcd_dir, function (err) {
                if (err) {
                    log.error(err, 'etcd backend error');
                }
                else {
                    createWatcher();
                }
            });
        }
        else if (!err && body.node.dir) {
            for (var pos in body.node.nodes) {
                try {
                    var node = body.node.nodes[pos];
                    var key = node.key.substr(body.node.key.length + 1)
                    if (node.key && node.value && !IsJsonString(node.value)) {
                        _this.redbird.register(removeEtcDir(key), node.value);
                    }
                    else if (node.key && node.value && IsJsonString(node.value)) {
                        var config = JSON.parse(node.value);
                        if (config.docker !== undefined) {
                            require('../').docker(_this.redbird).register(removeEtcDir(key), config.value.docker, config.value);
                        } else {
                            if (config.hosts) {
                                _this.redbird.register(removeEtcDir(key), config.hosts, config);
                            } else {
                                if(config.paths){
                                    for(var path in config.paths){
                                        log.info("New Config Data: %s", removeEtcDir(key)+path)
                                        _this.redbird.register(removeEtcDir(key)+path, config.paths[path], config);
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    continue
                }
            }

            createWatcher();
        }
        else {
            log.error(err, 'etcd backend error');
        }
    });

    // Helper function to check if values contain settings
    function IsJsonString(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    // Helper function to pretify etcd directory strings
    function removeEtcDir(str) {
        return str.replace(_this.etcd_dir, '').replace(/^\/+|\/+$/g, '');
    }

    function createWatcher() {

        // Watch etcd directory
        _this.watcher = _this.etcd.watcher(_this.etcd_dir, null, {recursive: true});

        // On Add/Update
        _this.watcher.on("change", function (body, headers) {
            log.info("New Config Data for key %s: %s", body.node.key, body.node.value)
            try {
                if(body.node.key && body.node.value){
                    var key = removeEtcDir(body.node.key);
                    var host = _this.redbird.routing[key] || [];
                    if (!IsJsonString(body.node.value)) {
                        _this.redbird.register(key, body.node.value);
                    } else {
                        var config = JSON.parse(body.node.value);
                        if (config.docker !== undefined) {
                            require('../').docker(_this.redbird).register(key, body.node.value.docker, body.node.value);
                        } else {
                            if (config.hosts !== 'undefined') {
                                log.info("Config Data for key %s using hosts: %s", key, config.hosts)
                                var route = _.find(host, { path: "/" });
                                if(route){
                                    _this.redbird.unregister(key, config.hosts);
                                }
                                _this.redbird.register(key, config.hosts, config);
                            } else {
                                if(config.paths !== 'undefined'){
                                    log.info("Config Data for key %s using paths: %s", key, config.paths)
                                    for(var path in config.paths){
                                        var route = _.find(host, { path: path });
                                        if(route){
                                            log.info("Unregistering path %s", key+path)
                                            _this.redbird.unregister(key+path, config.paths[path]);
                                        }
                                        log.info("Registering path %s using config: %s", key+path, config)
                                        _this.redbird.register(key+path, config.paths[path], config);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {

            }
        });

        // On Delete
        _this.watcher.on("delete", function (body, headers) {
            if (body.node.key) {
                _this.redbird.unregister(removeEtcDir(body.node.key));
            }
        });

        // Handle Errors
        _this.watcher.on("error", function (err) {
            log.error(err, 'etcd backend error');
        });
    }
}

module.exports = ETCDModule;
