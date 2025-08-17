#!/bin/bash

# Deployment script for Spotify Music Discovery
# Run this on your VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to ask for confirmation
confirm() {
    local message="$1"
    echo -e "${YELLOW}$message${NC}"
    read -p "Continue? [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Cancelled by user${NC}"
        exit 1
    fi
}

echo -e "${BLUE}🎵 Spotify Music Discovery Deployment Script${NC}"
echo "This will deploy your app to glkn.xyz/music"
echo

# Stage 1: Check prerequisites
echo -e "${BLUE}Stage 1: Checking prerequisites...${NC}"
echo "- Checking if required files exist..."
DIST_PATH="/home/debian/Git/Spotify/dist"
if [ ! -d "$DIST_PATH" ]; then
    echo -e "${RED}Error: $DIST_PATH directory not found. Run 'npm run build' first.${NC}"
    exit 1
fi
if [ ! -f "spotify-music.service" ]; then
    echo -e "${RED}Error: spotify-music.service not found.${NC}"
    exit 1
fi
if [ ! -f "nginx-music.conf" ]; then
    echo -e "${RED}Error: nginx-music.conf not found.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ All required files found${NC}"
confirm "Create directory structure at /var/www/music?"

# Stage 2: Create directory structure
echo -e "${BLUE}Stage 2: Setting up directories...${NC}"
sudo mkdir -p /var/www/music
sudo chown -R www-data:www-data /var/www/music
echo -e "${GREEN}✅ Directory structure created${NC}"
confirm "Copy built files to /var/www/music?"

# Stage 3: Copy built files
echo -e "${BLUE}Stage 3: Copying application files...${NC}"
sudo cp -r "$DIST_PATH"/* /var/www/music/
echo -e "${GREEN}✅ Files copied successfully${NC}"
confirm "Install and start systemd service?"

# Stage 4: Install systemd service
echo -e "${BLUE}Stage 4: Installing systemd service...${NC}"
sudo cp spotify-music.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable spotify-music.service
sudo systemctl start spotify-music.service

# Check service status
if sudo systemctl is-active --quiet spotify-music.service; then
    echo -e "${GREEN}✅ Service started successfully${NC}"
else
    echo -e "${RED}⚠️  Service may have issues. Check with: sudo systemctl status spotify-music.service${NC}"
fi
confirm "Install nginx snippet?"

# Stage 5: Configure nginx snippet
echo -e "${BLUE}Stage 5: Installing nginx snippet...${NC}"
sudo cp nginx-music.conf /etc/nginx/snippets/music-server.conf
echo -e "${GREEN}✅ Nginx snippet installed${NC}"
confirm "Automatically add include line to nginx config?"

# Stage 6: Update nginx config
echo -e "${BLUE}Stage 6: Updating nginx configuration...${NC}"
NGINX_CONFIG="/etc/nginx/sites-available/default"

# Check if include line already exists
if grep -q "include /etc/nginx/snippets/music-server.conf;" "$NGINX_CONFIG"; then
    echo -e "${YELLOW}Include line already exists in nginx config${NC}"
else
    # Find the line with other includes and add after it
    if grep -q "include /etc/nginx/snippets/.*\.conf;" "$NGINX_CONFIG"; then
        # Add after the last include line
        sudo sed -i '/include \/etc\/nginx\/snippets\/.*\.conf;/a\    include /etc/nginx/snippets/music-server.conf;' "$NGINX_CONFIG"
        echo -e "${GREEN}✅ Include line added to nginx config${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not find other include lines. Please manually add:${NC}"
        echo -e "${YELLOW}    include /etc/nginx/snippets/music-server.conf;${NC}"
        echo -e "${YELLOW}to your server block in $NGINX_CONFIG${NC}"
    fi
fi

confirm "Test and reload nginx configuration?"

# Stage 7: Test and reload nginx
echo -e "${BLUE}Stage 7: Testing and reloading nginx...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ Nginx configuration test passed${NC}"
    sudo systemctl reload nginx
    echo -e "${GREEN}✅ Nginx reloaded successfully${NC}"
else
    echo -e "${RED}❌ Nginx configuration test failed${NC}"
    echo "Please fix the configuration manually"
    exit 1
fi

# Final status check
echo
echo -e "${BLUE}🎉 Deployment Summary:${NC}"
echo "=================================="

# Check service status
if sudo systemctl is-active --quiet spotify-music.service; then
    echo -e "Service Status: ${GREEN}✅ Running${NC}"
else
    echo -e "Service Status: ${RED}❌ Not running${NC}"
fi

# Check nginx status
if sudo systemctl is-active --quiet nginx; then
    echo -e "Nginx Status: ${GREEN}✅ Running${NC}"
else
    echo -e "Nginx Status: ${RED}❌ Not running${NC}"
fi

# Check if port 3000 is listening
if ss -tlnp | grep -q ":3000 "; then
    echo -e "Port 3000: ${GREEN}✅ Listening${NC}"
else
    echo -e "Port 3000: ${RED}❌ Not listening${NC}"
fi

echo
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${BLUE}🔗 Visit: https://glkn.xyz/music${NC}"
echo
echo "Useful commands:"
echo "- Check service: sudo systemctl status spotify-music.service"
echo "- View logs: sudo journalctl -u spotify-music.service -f"
echo "- Restart service: sudo systemctl restart spotify-music.service"