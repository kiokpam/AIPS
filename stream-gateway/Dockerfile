FROM aler9/mediamtx:latest

# Copy custom configuration
COPY mediamtx.yml /mediamtx.yml

# Expose ports
EXPOSE 1935 8554 8888 8889 9997 9998

# Use custom config
CMD ["mediamtx", "/mediamtx.yml"]
