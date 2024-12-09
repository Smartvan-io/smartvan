
ARG BUILD_FROM
FROM $BUILD_FROM


# Install required packages
RUN apk add --no-cache curl

# Create directories
RUN mkdir -p /var/www/smartvanio-cards

COPY run.sh /
RUN chmod a+x /run.sh

# Set up the work directory
# WORKDIR /var/www/smartvanio-cards

# Set the entry point for the add-on
CMD ["/run.sh"]
