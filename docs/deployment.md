# External Server Deployment

This app is a Next.js Node server. The external host needs Node 20+, a reverse proxy with HTTPS, production environment variables, and persistent storage for manager-created content.

## 1. Prepare the server

```bash
sudo mkdir -p /srv/aviatorbrew /var/lib/aviatorbrew
sudo chown -R $USER:$USER /srv/aviatorbrew /var/lib/aviatorbrew
```

Copy or pull `aviatorbrew-new` into `/srv/aviatorbrew/current`, then install and build:

```bash
cd /srv/aviatorbrew/current
npm ci
cp .env.production.example .env.production
nano .env.production
npm run build
```

Set `NEXT_PUBLIC_SITE_URL` to the public HTTPS hostname. Do not use a `192.168.x.x`, `localhost`, or workstation URL on the external server.

## 2. Run the app

For a manual smoke test:

```bash
PORT=4173 npm run start:public
```

Then from another shell:

```bash
curl -I http://127.0.0.1:4173/
curl -fsS http://127.0.0.1:4173/api/tours
```

Use a process manager for production. Example systemd unit:

```ini
[Unit]
Description=Aviator Brewing website
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/srv/aviatorbrew/current
EnvironmentFile=/srv/aviatorbrew/current/.env.production
ExecStart=/usr/bin/npm run start:public
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Install it as `/etc/systemd/system/aviatorbrew.service`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aviatorbrew
sudo systemctl status aviatorbrew
```

## 3. Put HTTPS in front

Example Nginx site:

```nginx
server {
  server_name aviatorbrew.com www.aviatorbrew.com;

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Issue the TLS certificate with Certbot or the server provider's HTTPS tooling, then route DNS for the public hostname to this server.

## 4. Make Aviator Live reachable

The website fetches the live music schedule server-side through `AVIATOR_LIVE_SCHEDULE_URL`, recent attendance check-in shows through `AVIATOR_LIVE_BOOKINGS_URL`, and the band application buttons use `AVIATOR_LIVE_APPLY_URL`.

For the external website, these must be reachable from the external server. A private LAN URL such as `http://192.168.7.171:5123/...` will only work on the brewery network. Use a public DNS name, VPN route, SSH tunnel, or an HTTPS reverse proxy to Aviator Live.

Current production template values:

```bash
AVIATOR_LIVE_APPLY_URL=http://aviatorlive.is-with-theband.com/apply
AVIATOR_LIVE_SCHEDULE_URL=http://aviatorlive.is-with-theband.com/api/public/live-music
AVIATOR_LIVE_BOOKINGS_URL=https://aviatorlive.beer/api/bookings
AVIATOR_LIVE_BOOKINGS_AUTH=Bearer your-aviator-live-token
```

Prefer HTTPS for those URLs before public launch. Local development defaults attendance check-ins to `http://127.0.0.1:4100/api/bookings` when `AVIATOR_LIVE_BOOKINGS_URL` is not set.

## 5. Persist manager content

JSON records are configured in `.env.production` to live under `/var/lib/aviatorbrew`. Back up that directory.

Manager uploads are currently written under:

```text
public/media/menus
public/media/website-photos
public/media/location-photos
public/images/products/managed
```

On a single long-lived server, keep those directories in place and include them in backups. If you deploy by replacing the whole app directory, preserve or reattach those directories before starting the new release.

## 6. Production checks

After deployment:

```bash
curl -I https://aviatorbrew.com/
curl -I https://aviatorbrew.com/sitemap.xml
curl -fsS https://aviatorbrew.com/api/tours
```

Also test `/manager`, `/media-library`, `/coupons`, `/coupon-validate`, `/kegs`, `/events/live-music`, and a Stripe tour checkout using test credentials before switching to live Stripe keys.
