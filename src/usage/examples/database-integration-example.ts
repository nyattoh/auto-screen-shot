/**
 * Example demonstrating how to integrate UsageDatabase with TimeTracker
 * This shows the complete flow from window tracking to data persistence
 */

import { UsageDatabase, UsageSession } from '../UsageDatabase';
import { TimeTracker } from '../TimeTracker';
import { WindowInfo } from '../../types';

export class UsageTrackingExample {
    private database: UsageDatabase;
    private timeTracker: TimeTracker;

    constructor(dbPath?: string) {
        this.database = new UsageDatabase(dbPath);
        this.timeTracker = new TimeTracker();
    }

    async initialize(): Promise<void> {
        await this.database.initialize();
        
        // Initialize with some default site patterns
        await this.setupDefaultSitePatterns();
    }

    private async setupDefaultSitePatterns(): Promise<void> {
        const defaultPatterns = [
            {
                name: 'X (Twitter)',
                patterns: ['*twitter.com*', '*x.com*'],
                category: 'Social Media',
                icon: 'twitter-icon.png'
            },
            {
                name: 'ChatGPT',
                patterns: ['*chat.openai.com*', '*chatgpt.com*'],
                category: 'AI Tools',
                icon: 'chatgpt-icon.png'
            },
            {
                name: 'YouTube',
                patterns: ['*youtube.com*', '*youtu.be*'],
                category: 'Entertainment',
                icon: 'youtube-icon.png'
            },
            {
                name: 'GitHub',
                patterns: ['*github.com*'],
                category: 'Development',
                icon: 'github-icon.png'
            },
            {
                name: 'Visual Studio Code',
                patterns: ['*Visual Studio Code*'],
                category: 'Development',
                icon: 'vscode-icon.png'
            }
        ];

        for (const pattern of defaultPatterns) {
            await this.database.saveSitePattern(pattern);
        }
    }

    /**
     * Simulate window change and track usage
     */
    async trackWindowChange(windowInfo: WindowInfo): Promise<void> {
        // End current session if exists
        const previousSession = this.timeTracker.endSession();
        if (previousSession && previousSession.isValid) {
            await this.saveSession(previousSession);
        }

        // Start new session
        this.timeTracker.startSession(windowInfo);
    }

    /**
     * Convert TimeTracker session to database session format
     */
    private async saveSession(session: any): Promise<void> {
        const dbSession: UsageSession = {
            windowTitle: session.windowInfo.title,
            processName: session.windowInfo.processName,
            processId: session.windowInfo.processId,
            application: session.contentInfo.application,
            content: session.contentInfo.content,
            category: session.contentInfo.category,
            startTime: session.startTime,
            endTime: session.endTime,
            duration: session.duration,
            date: session.startTime.toISOString().split('T')[0]
        };

        await this.database.saveSession(dbSession);
        console.log(`Saved session: ${dbSession.application} - ${dbSession.content} (${Math.round(dbSession.duration / 60000)} minutes)`);
    }

    /**
     * Get daily usage statistics
     */
    async getDailyStats(date: Date = new Date()): Promise<void> {
        const dailyUsage = await this.database.getDailyUsage(date);
        
        console.log(`\n=== Daily Usage Statistics for ${date.toDateString()} ===`);
        console.log(`Total applications tracked: ${dailyUsage.length}`);
        
        let totalMinutes = 0;
        dailyUsage.forEach(usage => {
            totalMinutes += usage.totalDuration;
            console.log(`${usage.application} - ${usage.content}: ${usage.totalDuration} minutes (${usage.sessionCount} sessions)`);
        });
        
        console.log(`Total screen time: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`);
    }

    /**
     * Export usage data to CSV
     */
    async exportData(startDate: Date, endDate: Date, filePath: string): Promise<void> {
        const csvData = await this.database.exportToCSV(startDate, endDate);
        
        // In a real implementation, you would write this to a file
        console.log(`\n=== CSV Export (${startDate.toDateString()} to ${endDate.toDateString()}) ===`);
        console.log(csvData);
    }

    /**
     * Cleanup old data
     */
    async performMaintenance(retentionDays: number = 30): Promise<void> {
        await this.database.cleanup(retentionDays);
        console.log(`Maintenance completed: removed data older than ${retentionDays} days`);
    }

    /**
     * Simulate a day of usage tracking
     */
    async simulateUsageDay(): Promise<void> {
        console.log('=== Simulating a day of usage tracking ===\n');

        // Simulate different window activities throughout the day
        const activities = [
            {
                title: 'Visual Studio Code - main.ts',
                processName: 'Code.exe',
                processId: 1234,
                duration: 45 * 60 * 1000 // 45 minutes
            },
            {
                title: 'ChatGPT - OpenAI',
                processName: 'chrome.exe',
                processId: 5678,
                duration: 20 * 60 * 1000 // 20 minutes
            },
            {
                title: 'GitHub - microsoft/vscode',
                processName: 'chrome.exe',
                processId: 5678,
                duration: 15 * 60 * 1000 // 15 minutes
            },
            {
                title: 'YouTube - Programming Tutorial',
                processName: 'chrome.exe',
                processId: 5678,
                duration: 30 * 60 * 1000 // 30 minutes
            },
            {
                title: 'X (Twitter) - Home',
                processName: 'chrome.exe',
                processId: 5678,
                duration: 10 * 60 * 1000 // 10 minutes
            }
        ];

        let currentTime = new Date();
        currentTime.setHours(9, 0, 0, 0); // Start at 9 AM

        for (const activity of activities) {
            const windowInfo: WindowInfo = {
                title: activity.title,
                processName: activity.processName,
                processId: activity.processId,
                bounds: { x: 0, y: 0, width: 1920, height: 1080 },
                timestamp: new Date(currentTime)
            };

            // Start session
            this.timeTracker.startSession(windowInfo);
            
            // Simulate time passing
            currentTime = new Date(currentTime.getTime() + activity.duration);
            
            // End session and save
            const session = this.timeTracker.endSession();
            if (session) {
                // Manually set the end time and duration for simulation
                session.endTime = new Date(currentTime);
                session.duration = activity.duration;
                session.isValid = activity.duration >= 60000; // 1 minute minimum
                
                if (session.isValid) {
                    await this.saveSession(session);
                }
            }
        }

        console.log('\nSimulation completed!\n');
    }

    async close(): Promise<void> {
        await this.database.close();
    }
}

// Example usage
async function runExample(): Promise<void> {
    const example = new UsageTrackingExample();
    
    try {
        await example.initialize();
        
        // Simulate a day of usage
        await example.simulateUsageDay();
        
        // Show daily statistics
        await example.getDailyStats();
        
        // Export data
        const today = new Date();
        await example.exportData(today, today, 'usage-export.csv');
        
        // Perform maintenance
        await example.performMaintenance();
        
    } catch (error) {
        console.error('Example failed:', error);
    } finally {
        await example.close();
    }
}

// Uncomment to run the example
// runExample().catch(console.error);

export { runExample };