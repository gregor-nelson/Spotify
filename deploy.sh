#!/bin/bash

# Deployment script for Spotify Music Discovery
# Run this on your VPS

set -e

echo "🎵 Deploying Spotify Music Discovery to glkn.xyz/music..."

# Create directory structure
sudo mkdir -p /var/www/music
sudo chown -R www-data:www-data /var/www/music

# Copy built files
echo "📁 Copying files..."
sudo cp -r dist/* /var/www/music/

# Install systemd service
echo "⚙️  Installing systemd service..."
sudo cp spotify-music.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable spotify-music.service
sudo systemctl start spotify-music.service

# Configure nginx snippet
echo "🌐 Configuring nginx snippet..."
sudo cp nginx-music.conf /etc/nginx/snippets/music-server.conf

echo "✏️  Add this line to your main server block in /etc/nginx/sites-available/default:"
echo "    include /etc/nginx/snippets/music-server.conf;"
echo ""
echo "Then run: sudo nginx -t && sudo systemctl reload nginx"

echo "✅ Deployment complete!"
echo "🔗 Visit: http://glkn.xyz/music"