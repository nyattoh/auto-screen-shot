import { IUsageDatabase, DailyUsage, HourlySessionData } from './UsageDatabase';

// Type definitions for analysis results
export interface DailyAnalysis {
    date: string;
    totalScreenTime: number; // minutes
    applicationBreakdown: AppUsage[];
    categoryBreakdown: CategoryUsage[];
    peakHours: HourlyUsage[];
}

export interface AppUsage {
    application: string;
    content: string;
    duration: number; // minutes
    percentage: number;
    formattedDuration: string; // HH:MM format
}

export interface CategoryUsage {
    category: string;
    duration: number; // minutes
    percentage: number;
    formattedDuration: string; // HH:MM format
    applications: string[];
}

export interface HourlyUsage {
    hour: number;
    duration: number; // minutes
    formattedDuration: string; // HH:MM format
}

export interface IUsageAnalyzer {
    analyzeDailyUsage(date: Date): Promise<DailyAnalysis>;
    getTopApplications(date: Date, limit: number): Promise<AppUsage[]>;
    getCategoryBreakdown(date: Date): Promise<CategoryUsage[]>;
    formatDuration(minutes: number): string;
}

export class UsageAnalyzer implements IUsageAnalyzer {
    constructor(private database: IUsageDatabase) {}

    async analyzeDailyUsage(date: Date): Promise<DailyAnalysis> {
        const dailyUsage = await this.database.getDailyUsage(date);
        
        if (dailyUsage.length === 0) {
            return {
                date: this.formatDate(date),
                totalScreenTime: 0,
                applicationBreakdown: [],
                categoryBreakdown: [],
                peakHours: []
            };
        }

        const totalScreenTime = dailyUsage.reduce((sum, usage) => sum + usage.totalDuration, 0);
        
        const applicationBreakdown = this.calculateApplicationBreakdown(dailyUsage, totalScreenTime);
        const categoryBreakdown = await this.getCategoryBreakdown(date);
        const peakHours = await this.calculatePeakHours(date);

        return {
            date: this.formatDate(date),
            totalScreenTime,
            applicationBreakdown,
            categoryBreakdown,
            peakHours
        };
    }

    async getTopApplications(date: Date, limit: number = 10): Promise<AppUsage[]> {
        const dailyUsage = await this.database.getDailyUsage(date);
        
        if (dailyUsage.length === 0) {
            return [];
        }

        const totalScreenTime = dailyUsage.reduce((sum, usage) => sum + usage.totalDuration, 0);
        const applicationBreakdown = this.calculateApplicationBreakdown(dailyUsage, totalScreenTime);
        
        return applicationBreakdown
            .sort((a, b) => b.duration - a.duration)
            .slice(0, limit);
    }

    async getCategoryBreakdown(date: Date): Promise<CategoryUsage[]> {
        const dailyUsage = await this.database.getDailyUsage(date);
        
        if (dailyUsage.length === 0) {
            return [];
        }

        const totalScreenTime = dailyUsage.reduce((sum, usage) => sum + usage.totalDuration, 0);
        
        // Group by category
        const categoryMap = new Map<string, {
            duration: number;
            applications: Set<string>;
        }>();

        dailyUsage.forEach(usage => {
            const existing = categoryMap.get(usage.category) || {
                duration: 0,
                applications: new Set<string>()
            };
            
            existing.duration += usage.totalDuration;
            existing.applications.add(usage.application);
            
            categoryMap.set(usage.category, existing);
        });

        const categoryBreakdown: CategoryUsage[] = Array.from(categoryMap.entries()).map(([category, data]) => ({
            category,
            duration: data.duration,
            percentage: totalScreenTime > 0 ? Math.round((data.duration / totalScreenTime) * 100) : 0,
            formattedDuration: this.formatDuration(data.duration),
            applications: Array.from(data.applications).sort()
        }));

        return categoryBreakdown.sort((a, b) => b.duration - a.duration);
    }

    formatDuration(minutes: number): string {
        if (minutes < 1) {
            return '0:00';
        }
        
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        
        if (hours === 0) {
            return `0:${mins.toString().padStart(2, '0')}`;
        }
        
        return `${hours}:${mins.toString().padStart(2, '0')}`;
    }

    private calculateApplicationBreakdown(dailyUsage: DailyUsage[], totalScreenTime: number): AppUsage[] {
        return dailyUsage.map(usage => ({
            application: usage.application,
            content: usage.content,
            duration: usage.totalDuration,
            percentage: totalScreenTime > 0 ? Math.round((usage.totalDuration / totalScreenTime) * 100) : 0,
            formattedDuration: this.formatDuration(usage.totalDuration)
        }));
    }

    private async calculatePeakHours(date: Date): Promise<HourlyUsage[]> {
        const hourlyData = await this.database.getHourlyUsage(date);
        
        return hourlyData.map(data => ({
            hour: data.hour,
            duration: data.totalDuration,
            formattedDuration: this.formatDuration(data.totalDuration)
        })).sort((a, b) => b.duration - a.duration);
    }

    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
}