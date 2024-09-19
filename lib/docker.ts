/*eslint-env node */
'use strict';

import pino from 'pino';
import { Redbird } from './proxy.js';

/**
	Redbird Docker Module.

	This module handles automatic regitration and de-registration of
	services running on docker containers.
*/

export class DockerModule {
  private targets: Record<string, Record<string, string>>;
  private images: Record<string, Record<string, string>>;
  private ports: any;
  private dolphin: any;
  private events: any;
  private log: pino.Logger<never, boolean>;

  constructor(private redbird: Redbird, url: string) {
    const Dolphin = require('dolphin');

    this.redbird = redbird;
    this.log = redbird.logger;

    const targets: Record<string, Record<string, string>> = (this.targets = {});
    this.ports = {};

    // We keep an up-to-date table with all the images having
    // containers running on the system.
    const images: Record<string, Record<string, string>> = (this.images = {});
    const dolphin = (this.dolphin = new Dolphin(url));

    const _this = this;

    // Start docker event listener
    this.events = dolphin.events();

    this.events.on('connected', () => {
      //  Fetch all running containers and register them if
      //  necessary.
      dolphin.containers({ filters: { status: ['running'] } }).then(
        (
          containers: {
            Image: string;
            Id: string;
            Names: string[];
          }[]
        ) => {
          for (var i = 0; i < containers.length; i++) {
            const container = containers[i];
            this.registerIfNeeded(
              container.Image,
              container.Id,
              container.Names[0].replace('/', '')
            );
          }
        }
      );
    });

    this.events.on(
      'event',
      (evt: {
        status: string;
        from: string;
        id: string;
        Actor: { Attributes: { name: string } };
      }) => {
        let image: Record<string, string>;
        let target: Record<string, string>;

        this.log?.info('Container %s changed to status %s', evt.Actor.Attributes.name, evt.status);

        switch (evt.status) {
          case 'start':
          case 'restart':
          case 'unpause':
            this.registerIfNeeded(evt.from, evt.id, evt.Actor.Attributes.name);
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
                  this.log?.info(
                    'Un-registering container %s for target %s',
                    evt.Actor.Attributes.name,
                    target.src
                  );
                  _this.redbird.unregister(target.src, _this.ports[evt.id]);
                }
                image[evt.id] = 'stopped';
              }
            }
            break;
          default:
          // Nothing
        }
      }
    );

    this.events.on('error', (err: Error) => {
      this.log.error(err, 'dolphin docker event error');
    });
  }

  registerIfNeeded(imageName: string, containerId: string, containerName: string) {
    const image = (this.images[imageName] = this.images[imageName] || {});

    for (var targetName in this.targets) {
      const match = isMatchingImageName(targetName, imageName);

      if (match && image[containerId] !== 'running') {
        const target = this.targets[targetName];
        this.log?.info('Registering container %s for target %s', containerName, target.src);
        this.registerContainer(target.src, containerId, target.opts);
      }
    }

    image[containerId] = 'running';
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
  register(src: string, target: string, opts: any) {
    var storedTarget = this.targets[target];

    if (storedTarget && storedTarget.src == src) {
      throw Error('Cannot register the same src and target twice');
    }

    this.targets[target] = {
      src,
      opts,
    };

    for (var imageName in this.images) {
      const image = this.images[imageName];
      for (var containerId in image) {
        this.registerIfNeeded(imageName, containerId, containerId);
      }
    }
  }

  async registerContainer(src: string | URL, containerId: string, opts: any) {
    const targetPort = await containerPort(this.dolphin, containerId);
    this.redbird.register(src, targetPort, opts);
    this.ports[containerId] = targetPort;
  }
}

function isMatchingImageName(targetName: string, imageName: string) {
  var regex = new RegExp('^' + targetName + '$');
  return regex.test(imageName);
}

function containerPort(dolphin: any, containerId: string) {
  return dolphin.containers
    .inspect(containerId)
    .then((container: { NetworkSettings: { Ports: any; Networks: any }; IPAddress: string }) => {
      const port = Object.keys(container.NetworkSettings.Ports)[0].split('/')[0];

      const netNames = Object.keys(container.NetworkSettings.Networks);
      if (netNames.length === 1) {
        const ip = container.NetworkSettings.Networks[netNames[0]].IPAddress;
        if (port && ip) {
          return 'http://' + ip + ':' + port;
        }
      } else {
        //TODO: Implements opts for manually choosing the network/ip/port...
      }
      throw Error('No valid address or port ' + container.IPAddress + ':' + port);
    });
}
