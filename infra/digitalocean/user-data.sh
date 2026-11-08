#!/bin/bash
# DigitalOcean "User data" for a new droplet: sets up Bucks Haven Farm on first boot.
# Fill in APP_DOMAIN, paste into the droplet's User data box, then point the
# domain's A record at the droplet. Progress: /var/log/buckshavenfarm-setup.log
exec > >(tee -a /var/log/buckshavenfarm-setup.log) 2>&1
export HOME=/root
git clone -q --branch main https://github.com/Jamesrowan11/buckshavenfarm.git /root/buckshavenfarm-setup
APP_DOMAIN='buckshavenfarm.example.com' bash /root/buckshavenfarm-setup/infra/digitalocean/setup.sh
