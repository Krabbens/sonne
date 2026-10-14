FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node server.mjs discord-auth.mjs ./
COPY --chown=node:node dist ./dist
RUN chmod -R a+rX /app/dist
USER node
ENV HOST=0.0.0.0 PORT=9080 STUDIO_DATA_DIR=/data
EXPOSE 9080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:9080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
