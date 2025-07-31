# Redis Setup Instructions for Windows

## Option 1: Using Windows Subsystem for Linux (WSL) - Recommended

1. Install WSL2 if not already installed:
   ```powershell
   wsl --install
   ```

2. Open WSL terminal and install Redis:
   ```bash
   sudo apt update
   sudo apt install redis-server
   ```

3. Start Redis:
   ```bash
   sudo service redis-server start
   ```

4. Verify Redis is running:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

## Option 2: Using Docker

1. Install Docker Desktop for Windows

2. Run Redis container:
   ```powershell
   docker run -d -p 6379:6379 --name redis-server redis:latest
   ```

3. Verify:
   ```powershell
   docker ps
   ```

## Option 3: Native Windows Build

1. Download Redis for Windows from:
   - https://github.com/microsoftarchive/redis/releases
   - Or https://github.com/tporadowski/redis/releases

2. Extract to `C:\Redis`

3. Run Redis server:
   ```powershell
   cd C:\Redis
   redis-server.exe
   ```

## Option 4: Using Memurai (Redis-compatible)

1. Download Memurai from: https://www.memurai.com/get-memurai

2. Install and run as Windows service

## Running Without Redis (Development Only)

The application can run without Redis, but queue functionality will be disabled. 
To run without Redis:

1. Start the server normally:
   ```bash
   npm start
   ```

2. The server will show Redis connection errors but continue running

3. Use non-queue endpoints:
   - Regular batch processing: `POST /api/sessions/:id/batch-process`
   - Direct scraping: `POST /api/scraper/profile/:username`

## Verify Redis Connection

Once Redis is installed and running, test the connection:

```bash
redis-cli
127.0.0.1:6379> ping
PONG
127.0.0.1:6379> exit
```

## Troubleshooting

1. **Port Already in Use**:
   ```powershell
   netstat -ano | findstr :6379
   taskkill /PID <PID> /F
   ```

2. **WSL Redis Not Accessible**:
   - Edit `/etc/redis/redis.conf` in WSL
   - Change `bind 127.0.0.1` to `bind 0.0.0.0`
   - Restart Redis: `sudo service redis-server restart`

3. **Docker Connection Issues**:
   - Ensure Docker Desktop is running
   - Check container: `docker ps`
   - Restart container: `docker restart redis-server`