#!/bin/bash

# WebSync Startup Script for Linux

# Configuration
BASE_DIR=$(cd "$(dirname "$0")" && pwd)
BACKEND_DIR="$BASE_DIR/backend"
FRONTEND_DIR="$BASE_DIR/frontend"
LOG_DIR="$BASE_DIR/logs"
PID_DIR="$BASE_DIR/pids"

# Create necessary directories
mkdir -p "$LOG_DIR"
mkdir -p "$PID_DIR"

# Default settings
DAEMON=false

# Help function
show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -d, --daemon    Run services in the background"
    echo "  -h, --help      Show this help message"
    echo ""
}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -d|--daemon) DAEMON=true ;;
        -h|--help) show_help; exit 0 ;;
        *) echo "Unknown parameter: $1"; show_help; exit 1 ;;
    esac
    shift
done

echo "Starting WebSync..."

# --- Backend Setup ---
echo "[Backend] Checking environment..."
cd "$BACKEND_DIR"

if [ ! -d "venv" ]; then
    echo "[Backend] Creating Python virtual environment..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "[Backend] Error: Failed to create venv. Ensure python3-venv is installed."
        exit 1
    fi
    source venv/bin/activate
    echo "[Backend] Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
    # Check if key dependencies are installed
    if ! python -c "import flask" 2>/dev/null; then
        echo "[Backend] Dependencies missing or incomplete. Installing..."
        pip install -r requirements.txt
    fi
fi

# --- Frontend Setup ---
echo "[Frontend] Checking environment..."

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "[Frontend] Error: npm is not installed. Please install Node.js and npm."
    exit 1
fi

cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    echo "[Frontend] Installing dependencies..."
    # Use limited memory for installation to prevent freeze
    export NODE_OPTIONS="--max-old-space-size=2048"
    npm install --legacy-peer-deps
fi

if [ ! -d "build" ]; then
    echo "[Frontend] Building project..."
    # Use limited memory for build to prevent freeze
    export NODE_OPTIONS="--max-old-space-size=2048"
    export GENERATE_SOURCEMAP=false
    npm run build
else
    echo "[Frontend] Build artifact exists. Skipping build."
fi

# --- Start Services ---

start_backend() {
    cd "$BACKEND_DIR"
    source venv/bin/activate
    
    if [ "$DAEMON" = true ]; then
        nohup python app.py > "$LOG_DIR/backend.log" 2>&1 &
        echo $! > "$PID_DIR/backend.pid"
        echo "[Backend] Started in background (PID: $(cat "$PID_DIR/backend.pid"))"
    else
        python app.py 2>&1 | tee -a "$LOG_DIR/backend.log" &
        BACKEND_PID=$!
        echo "[Backend] Started (PID: $BACKEND_PID)"
    fi
}

start_frontend() {
    cd "$FRONTEND_DIR"
    
    if [ "$DAEMON" = true ]; then
        nohup npm run serve > "$LOG_DIR/frontend.log" 2>&1 &
        echo $! > "$PID_DIR/frontend.pid"
        echo "[Frontend] Started in background (PID: $(cat "$PID_DIR/frontend.pid"))"
    else
        npm run serve 2>&1 | tee -a "$LOG_DIR/frontend.log" &
        FRONTEND_PID=$!
        echo "[Frontend] Started (PID: $FRONTEND_PID)"
    fi
}

# Start Backend
start_backend

# Wait a moment for backend to initialize
sleep 2

# Start Frontend
start_frontend

if [ "$DAEMON" = true ]; then
    echo ""
    echo "WebSync started successfully in background."
    echo "Logs are available in: $LOG_DIR"
    echo "FrontEnd: http://localhost:3000"
    echo "BackEnd:  http://localhost:5002"
else
    echo ""
    echo "WebSync started. Press Ctrl+C to stop."
    echo "FrontEnd: http://localhost:3000"
    echo "BackEnd:  http://localhost:5002"
    
    # Trap signal to kill both processes
    cleanup() {
        echo ""
        echo "Stopping services..."
        kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
        exit
    }
    trap cleanup SIGINT SIGTERM
    
    wait
fi
