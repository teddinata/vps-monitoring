const { NodeSSH } = require('node-ssh');

class VPSMonitor {
    constructor(config) {
        this.config = {
            host: config.host,
            username: config.username,
            password: config.password,
            debug: true,
            readyTimeout: 20000,
            tryKeyboard: true,
            keepaliveInterval: 10000,
        };
        this.ssh = new NodeSSH();
        this.isConnected = false;
    }

    async connect() {
        try {
            console.log('Attempting to connect to:', this.config.host);
            if (!this.isConnected) {
                await this.ssh.connect(this.config);
                this.isConnected = true;
                console.log('Successfully connected to VPS');
            }
        } catch (error) {
            console.error('Detailed connection error:', error);
            this.isConnected = false;
            throw error;
        }
    }

    async getSystemMetrics() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const [cpuTotal, cpuPerCore, memory, disk, processes, cpuInfo, osInfo] = await Promise.all([
                this.ssh.execCommand("top -bn1 | grep 'Cpu(s)'"),
                this.ssh.execCommand("mpstat -P ALL 1 1"), // Mendapatkan statistik per CPU core
                this.ssh.execCommand('free -m'),
                this.ssh.execCommand('df -h /',), // Specifically target root partition
                this.ssh.execCommand('ps aux --sort=-%cpu | head -11'),
                this.ssh.execCommand('lscpu'),
                this.ssh.execCommand('cat /etc/os-release')
            ]);

            return {
                timestamp: new Date(),
                system: this.parseSystemInfo(osInfo.stdout, cpuInfo.stdout),
                cpu: this.parseCpuData(cpuTotal.stdout, cpuPerCore.stdout, cpuInfo.stdout),
                memory: this.parseMemoryData(memory.stdout),
                disk: this.parseDiskData(disk.stdout),
                processes: this.parseProcessData(processes.stdout)
            };
        } catch (error) {
            console.error('Error getting metrics:', error);
            this.isConnected = false;
            throw error;
        }
    }

    parseSystemInfo(osData, cpuData) {
        const osMatch = osData.match(/PRETTY_NAME="(.+)"/);
        const cpuModelMatch = cpuData.match(/Model name:\s+(.+)/);
        const cpuCoresMatch = cpuData.match(/CPU\(s\):\s+(\d+)/);

        return {
            os: osMatch ? osMatch[1] : 'Unknown',
            cpuModel: cpuModelMatch ? cpuModelMatch[1] : 'Unknown',
            totalCores: cpuCoresMatch ? parseInt(cpuCoresMatch[1]) : 4,
            maxCores: 4
        };
    }

    parseCpuData(totalData, perCoreData, cpuInfo) {
        const totalUsage = totalData.match(/(\d+\.\d+)\s*id/);
        const totalCpuUsage = totalUsage ? (100 - parseFloat(totalUsage[1])).toFixed(2) : 0;

        // Parse per-core data
        const coreStats = perCoreData.split('\n')
            .filter(line => line.match(/^[0-9]/))
            .map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    core: `CPU ${parts[1]}`,
                    user: parseFloat(parts[3]).toFixed(2),
                    system: parseFloat(parts[5]).toFixed(2),
                    iowait: parseFloat(parts[6]).toFixed(2),
                    idle: parseFloat(parts[11]).toFixed(2),
                    usage: (100 - parseFloat(parts[11])).toFixed(2)
                };
            });

        return {
            usage: totalCpuUsage,
            cores: coreStats,
            model: cpuInfo.match(/Model name:\s+(.+)/)?.[1] || 'Unknown',
            speed: cpuInfo.match(/CPU MHz:\s+(.+)/)?.[1] || 'Unknown'
        };
    }

    parseMemoryData(data) {
        const lines = data.split('\n');
        const memInfo = lines[1].split(/\s+/);
        
        const total = parseInt(memInfo[1]);
        const used = parseInt(memInfo[2]);
        const free = parseInt(memInfo[3]);
        
        return {
            total: total,
            used: used,
            free: free,
            usagePercent: ((used / total) * 100).toFixed(1)
        };
    }

    parseDiskData(data) {
        const lines = data.split('\n');
        const diskInfo = lines[1].split(/\s+/);
        
        return {
            total: diskInfo[1],
            used: diskInfo[2],
            free: diskInfo[3],
            usage: diskInfo[4]
        };
    }

    parseProcessData(data) {
        return data.split('\n')
            .slice(1)
            .map(line => {
                const parts = line.split(/\s+/);
                return {
                    user: parts[0],
                    pid: parts[1],
                    cpu: parts[2],
                    memory: parts[3],
                    command: parts[10]
                };
            });
    }

    async testConnection() {
        try {
            await this.connect();
            const result = await this.ssh.execCommand('echo "Connection test successful"');
            console.log('Test result:', result);
            return result.stdout;
        } catch (error) {
            console.error('Test connection failed:', error);
            throw error;
        }
    }
}

module.exports = VPSMonitor;