#!/bin/bash

# WebSync Stop Script for Linux

# Configuration
BASE_DIR=$(cd "$(dirname "$0")" && pwd)
PID_DIR="$BASE_DIR/pids"

# Function to stop a process by PID file
stop_process() {
    local name=$1
    local pid_file="$PID_DIR/$name.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null; then
            echo "Stopping $name (PID: $pid)..."
            kill $pid
            
            # Wait for process to exit
            for i in {1..10}; do
                if ! ps -p $pid > /dev/null; then
                    break
                fi
                sleep 0.5
            done
            
            if ps -p $pid > /dev/null; then
                echo "Force killing $name..."
                kill -9 $pid
            fi
            
            echo "$name stopped."
        else
            echo "$name is not running (PID $pid not found)."
        fi
        rm "$pid_file"
    else
        echo "No PID file found for $name."
    fi
}

echo "Stopping WebSync services..."

stop_process "frontend"
stop_process "backend"

echo "All services stopped."
