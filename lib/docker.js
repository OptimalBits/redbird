/*eslint-env node */
'use strict';

/**
	Redbird Docker Module.

	This module handles automatic regitration and de-registration of
	services running on docker containers.
*/
var Dolphin = require('dolphin');

function DockerModule(redbird, url) {
  if (!(this instanceof DockerModule)) {
    //TODO: should it return a new instance per redbird proxy?
    //because every time we run -> docker(redbird).register("localhost", "tomcat*")
    //a new DockerModule is created
    return new DockerModule(redbird, url);
  }

  this.redbird = redbird;
  var log = redbird.log;

  var targets = this.targets = {};
  this.ports = {};

  // We keep an up-to-date table with all the images having
  // containers running on the system.
  var images = this.images = {};
  var dolphin = this.dolphin = new Dolphin(url);

  var _this = this;

  function registerIfNeeded(imageName, containerId, containerName) {
    var image = images[imageName] = images[imageName] || {};

    for (var targetName in targets) {
        var match = isMatchingImageName(targetName, imageName);

        if (match && image[containerId] !== 'running') {
          var target = targets[targetName];
          log && log.info('Registering container %s for target %s', containerName, target.src);
          _this.registerContainer(target.src, containerId, target.opts);
        }
    }

    image[containerId] = 'running';
  }

  // Start docker event listener
  this.events = dolphin.events();

  this.events.on('connected', function () {

    //  Fetch all running containers and register them if
    //  necessary.
    dolphin.containers({ filters: {status:["running"]}}).then(function (containers) {
      for (var i = 0; i < containers.length; i++) {
        var container = containers[i];
        registerIfNeeded(container.Image, container.Id, container.Names[0].replace("/", ""));
      }
    });
  });

  this.events.on('event', function (evt) {
    var image, target;

    log && log.info('Container %s changed to status %s', evt.Actor.Attributes.name, evt.status);

    switch (evt.status) {
      case 'start':
      case 'restart':
      case 'unpause':
        registerIfNeeded(evt.from, evt.id, evt.Actor.Attributes.name);
        break;
      case 'stop':
      case 'die':
      case 'pause':
        image = images[evt.from];
        if (image) {
          for (var targetName in targets) {
            var match = isMatchingImageName(targetName, evt.from);
            if (image[evt.id] === 'running' && match && _this.ports[evt.id]) {
              target = targets[targetName];
              log && log.info('Un-registering container %s for target %s', evt.Actor.Attributes.name, target.src);
              _this.redbird.unregister(target.src, _this.ports[evt.id]);
            }
            image[evt.id] = 'stopped';
          }
        }
        break;
      default:
      // Nothing
    }
  });

  this.events.on('error', function (err) {
    log && log.error(err, 'dolphin docker event error');
  });
}

/**
 * Register route from a source to a given target.
 * The target should be an image name. Starting several containers
 * from the same image will automatically deliver the requests
 * to each container in a round-robin fashion.
 *
 * @param src    See {@link ReverseProxy.register}
 * @param target Docker image (this string is evaluated as regexExp)
 * @param opts   Options like ssl and etc...
 */
DockerModule.prototype.register = function (src, target, opts) {
  var storedTarget = this.targets[target];

  if (storedTarget && storedTarget.src == src) {
      throw Error('Cannot register the same src and target twice');
  }

  this.targets[target] = {
    src: src,
    opts: opts
  };

  for (var imageName in this.images) {
    var image = images[imageName];
    for (var containerId in image) {
      //TODO: Changed registerIfNeeded to be reusable here
      registerIfNeeded(imageName, containerId, containerId);
    }
  }
};

DockerModule.prototype.registerContainer = function (src, containerId, opts) {
  var _this = this;
  containerPort(this.dolphin, containerId).then(function (targetPort) {
    _this.redbird.register(src, targetPort, opts);
    _this.ports[containerId] = targetPort;
  });
};

function isMatchingImageName(targetName, imageName) {
    var regex = new RegExp("^" + targetName + "$");
    return regex.test(imageName);
}

function containerPort(dolphin, containerId) {
  return dolphin.containers.inspect(containerId).then(function (container) {
    var port = Object.keys(container.NetworkSettings.Ports)[0].split('/')[0];

    var netNames = Object.keys(container.NetworkSettings.Networks);
    if (netNames.length === 1) {
      var ip = container.NetworkSettings.Networks[netNames[0]].IPAddress;
      if (port && ip) {
        return 'http://' + ip + ':' + port;
      }
    } else {
      //TODO: Implements opts for manually choosing the network/ip/port...
    }
    throw Error('No valid address or port ' + container.IPAddress + ':' + port);
  });
}

module.exports = DockerModule;
