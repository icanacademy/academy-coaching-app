#!/bin/bash

# Academy Coaching App Launcher
cd /Users/icanacademy/academy-coaching-app

# Get local IP address
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "=================================="
echo "  Academy Coaching App"
echo "=================================="
echo ""

# Start Cloudflare tunnel if not already running
if ! pgrep -f "cloudflared tunnel run cosmodrive" > /dev/null 2>&1; then
    echo "🌐 Starting Cloudflare Tunnel..."
    cloudflared tunnel run cosmodrive &
    sleep 2
    echo "✅ Cloudflare Tunnel started"
else
    echo "🌐 Cloudflare Tunnel already running"
fi
echo "🌍 Public URL: https://coaching.icanacademy.work"
echo ""
echo "Starting server..."
echo ""

# Start the app
npm start &
SERVER_PID=$!

# Wait for server to be ready
sleep 3

echo ""
echo "App is running at:"
echo "  Local:   http://localhost:2006"
echo "  Network: http://$LOCAL_IP:2006"
echo ""
echo "Login: admin / admin123"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=================================="

# Open browser
open "http://$LOCAL_IP:2006"

# Wait for the server process
wait $SERVER_PID
