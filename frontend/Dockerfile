FROM docker.io/python:3.11 AS runner
WORKDIR /app
COPY . /app/
EXPOSE 8080
CMD [ "python", "-m", "http.server", "8080" ]
