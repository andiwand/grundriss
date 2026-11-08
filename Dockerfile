# The image of the Grundriss server: the server, the website, and the app of the same version.
# See the README for the configuration. Build: docker build -t grundriss .

FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The website at the root of dist/, the app in dist/app/, and the server in server/dist/.
RUN npx vite build -c vite.site.config.ts \
  && npx vite build --outDir dist/app --emptyOutDir false \
  && npm run build:server

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    GRUNDRISS_DATA=/data \
    GRUNDRISS_SITE=/srv/site \
    GRUNDRISS_APP=/srv/site/app
COPY --from=build /src/server/dist/main.mjs /srv/main.mjs
COPY --from=build /src/dist /srv/site
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "/srv/main.mjs"]
