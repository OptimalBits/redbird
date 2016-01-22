#!/bin/sh
docker -H=tcp://localhost:9999 stop proxy
docker -H=tcp://localhost:9999 rm proxy
docker -H=tcp://localhost:9999 run\
 --name proxy\
 -p 80:8000\
 --link static:static\
 --link app:app\
 --link gndio:gndio\
 --link optimalbits:optimalbits\
 --link medroid:medroid\
 -d -t optimalbits/proxy
