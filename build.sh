#!/bin/sh
docker -H=tcp://localhost:9999 build -t optimalbits/proxy .
