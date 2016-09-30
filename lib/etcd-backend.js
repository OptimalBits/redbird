/*eslint-env node */
'use strict';

/**
	Redbird ETCD Module
	This module handles automatic proxy registration via etcd
*/
var Etcd = require('node-etcd');

function ETCDModule(redbird, options){
  if (!(this instanceof ETCDModule)){
    return new ETCDModule(redbird, options);
  }

  // Create Redbird Instance and Log
  this.redbird = redbird;
  var log = redbird.log;
  var _this = this;

  // Create node-etcd Instance
  this.etcd = new Etcd(options.hosts,options.ssloptions);
  this.etcd_dir = (typeof options.path !== 'undefined') ? options.path : "redbird";

  // Create directory if not created
  this.etcd.get(this.etcd_dir,function(err, body, header){
    if (err && err.errorCode == 100){
      _this.etcd.mkdir(_this.etcd_dir, function(err){
        if (err){
          log.error(err, 'etcd backend error');
        }
        else{
          createWatcher();
        }
      });
    }
    else if(!err && body.node.dir){
      createWatcher();
    }
    else{
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

  function createWatcher(){
    // Watch etcd directory
    _this.watcher = _this.etcd.watcher(_this.etcd_dir, null, {recursive:true});

    // On Add/Update
    _this.watcher.on("change", function(body,headers){
      if(body.node.key && body.node.value && !IsJsonString(body.node.value)){
        _this.redbird.register(removeEtcDir(body.node.key),body.node.value);
      }
      else if(body.node.key && body.node.value && IsJsonString(body.node.value)){
        var config = JSON.parse(body.node.value);
        if (typeof config.docker !== 'undefined'){
          require('../').docker(_this.redbird).register(body.node.key,body.node.value.docker,body.node.value);
        }
        else {
          _this.redbird.register(removeEtcDir(body.node.key),config.hosts,config);
        }
      }
    });

    // On Delete
    _this.watcher.on("delete", function(body,headers){
      if(body.node.key){
        _this.redbird.unregister(removeEtcDir(body.node.key));
      }
    });

    // Handle Errors
    _this.watcher.on("error", function(err){
      log.error(err, 'etcd backend error');
    });
  }
}

module.exports = ETCDModule;
