/*eslint-env node */
'use strict';

/**
	Redbird ETCD Module
	This module handles automatic proxy registration via etcd
*/
var Etcd = require('node-etcd');

function ETCDModule(redbird, options){
  if (!(this instanceof ETCDModule)){
    return new ETCDModule(redbird, url);
  }

  // Create RedBird Instance and Log
  this.redbird = redbird;
  var log = redbird.log;

  // Create node-etcd variable
  var nodejsopts = {
    auth : options.auth,
    passphrase : options.passphrase,
    ca : options.ssl.ca,
    cert : options.ssl.cert,
    key : options.ssl.key,
    timeout : options.timeout
  }

  // Create node-etcd Instance
  etcd = new Etcd(options.hosts, options);

  // Create etcd directory if needed
  var etcd_dir = (typeof options.dir !== 'undefined') ? options.dir : "redbird";
  etcd.mkdir(etcd_dir,console.log);

  // Watch etcd directory
  this.watcher = etcd.watcher(etcd_dir,null,{recusrive:true});

  // On Set
  this.watcher.on("set", function(res){
    console.log(res);
  });

  // On Change

  // On Delete

  // Handle Errors
  this.watcher.on("error", function(err){
    log.error(err, 'etcd backend error');
  });
}

module.exports = ETCDModule;
