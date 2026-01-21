# Base Image 
FROM nginx:trixie-perl

# Dependencies
RUN apt update && apt upgrade -y
RUN apt install -y python3 python3-requests python3-bs4 cron
#Copy the index.html file /usr/share/nginx/html/
COPY . /usr/share/nginx/html/
#Expose Nginx Port
EXPOSE 80
#Start NginxService 
WORKDIR /usr/share/nginx/html
RUN python3 fuchsgeier.py
CMD ["nginx", "-g", "daemon off;"]