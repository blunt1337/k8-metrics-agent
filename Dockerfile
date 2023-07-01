FROM --platform=linux/amd64 node:18.11.0-alpine3.16

# Copy packages and source code
COPY package*.json /app/
RUN cd /app \
	&& npm install --only=production \
	&& rm -fr /root/.npm
COPY src /app/src

# Start
WORKDIR /app
CMD ["node", "src/index.js"]
