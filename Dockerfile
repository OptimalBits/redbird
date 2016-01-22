FROM	ubuntu:12.04
RUN apt-get update
RUN apt-get install -y python-software-properties python g++ make
RUN add-apt-repository ppa:chris-lea/node.js
RUN apt-get update
RUN apt-get install -y nodejs
RUN npm install -g forever
ADD . /proxy
RUN cd /proxy; npm install --production
EXPOSE  8000
ENV NODE_ENV production
ENTRYPOINT ["forever", "/proxy/proxy.js"]
