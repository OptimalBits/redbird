FROM node:4.5

ADD . /proxy
RUN cd /proxy; npm install --production
EXPOSE 8080

