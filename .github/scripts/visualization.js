const fs = require('fs');
const path = require('path');

async function generateVisualizations() {
    try {
        // Import dependencies
        const [d3Module, svgdomModule, svgjsModule] = await Promise.all([
            import('d3'),
            import('svgdom'),
            import('@svgdotjs/svg.js')
        ]);

        const d3 = d3Module.default;
        const { createSVGWindow } = svgdomModule;
        const { SVG, registerWindow } = svgjsModule;

        // Set up the SVG.js window environment
        const window = createSVGWindow();
        const document = window.document;
        registerWindow(window, document);

        // Load activity data
        const projectsDir = path.join(process.cwd(), 'projects');
        let allActivity = [];

        if (fs.existsSync(projectsDir)) {
            const projects = fs.readdirSync(projectsDir)
                .filter(file => fs.statSync(path.join(projectsDir, file)).isDirectory());

            for (const project of projects) {
                const logPath = path.join(projectsDir, project, 'activity-log.json');
                if (fs.existsSync(logPath)) {
                    try {
                        const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
                        allActivity = allActivity.concat(logs);
                    } catch (err) {
                        console.warn(`Warning: Could not parse log file for project ${project}:`, err);
                    }
                }
            }
        }

        // Create visualizations directory
        const visualizationsDir = path.join(process.cwd(), 'visualizations');
        if (!fs.existsSync(visualizationsDir)) {
            fs.mkdirSync(visualizationsDir, { recursive: true });
        }

        // Generate Heatmap
        const heatmapCanvas = SVG(document.documentElement);
        heatmapCanvas.size(800, 200);

        // Process activity data for heatmap
        const activityByDate = new Map();
        allActivity.forEach(entry => {
            const date = new Date(entry.timestamp).toISOString().split('T')[0];
            activityByDate.set(date, (activityByDate.get(date) || 0) + 1);
        });

        const maxActivity = Math.max(...activityByDate.values(), 1);
        Array.from(activityByDate.entries()).forEach(([date, count], i) => {
            const cellSize = 10;
            const cellPadding = 2;
            const x = (i % 52) * (cellSize + cellPadding) + 20;
            const y = Math.floor(i / 52) * (cellSize + cellPadding) + 20;
            const intensity = count / maxActivity;
            
            heatmapCanvas
                .rect(cellSize, cellSize)
                .move(x, y)
                .fill(`rgb(0,${Math.floor(intensity * 155)},${Math.floor(intensity * 255)})`)
                .radius(2);
        });

        // Save heatmap
        fs.writeFileSync(
            path.join(visualizationsDir, 'heatmap.svg'),
            heatmapCanvas.svg()
        );

        // Generate Activity Chart
        const chartCanvas = SVG(document.documentElement);
        chartCanvas.size(800, 300);

        // Process project data
        const projectActivity = new Map();
        allActivity.forEach(entry => {
            projectActivity.set(entry.project, (projectActivity.get(entry.project) || 0) + 1);
        });

        const projectData = Array.from(projectActivity.entries())
            .map(([name, activity]) => ({ name, activity }));

        const barWidth = 40;
        const barGap = 20;
        const maxProjectActivity = Math.max(...projectData.map(p => p.activity), 1);

        projectData.forEach((project, i) => {
            const height = (project.activity / maxProjectActivity) * 200;
            const x = i * (barWidth + barGap) + 50;
            const y = 250 - height;

            chartCanvas
                .rect(barWidth, height)
                .move(x, y)
                .fill('#4A90E2')
                .radius(4);

            chartCanvas
                .text(project.name)
                .move(x + barWidth/2, 260)
                .font({ size: 12, anchor: 'middle' });
        });

        // Save activity chart
        fs.writeFileSync(
            path.join(visualizationsDir, 'activity-chart.svg'),
            chartCanvas.svg()
        );

        // Create function quality chart
        const qualityCanvas = SVG(document.documentElement);
        qualityCanvas.size(800, 400);

        // Quality metrics over time
        const dateToQuality = new Map();
        allActivity.forEach(entry => {
            // Check the correct path for code quality data based on your activityTracker.js changes
            if (entry.changes && entry.changes.codeQuality) {
                const date = new Date(entry.timestamp).toISOString().split('T')[0];
                if (!dateToQuality.has(date)) {
                    dateToQuality.set(date, {
                        commentPercentage: 0,
                        complexity: 0,
                        count: 0
                    });
                }
                
                const current = dateToQuality.get(date);
                current.commentPercentage += entry.changes.codeQuality.commentPercentage || 0;
                current.complexity += entry.changes.codeQuality.complexity || 0;
                current.count++;
            }
        });

        // Convert to averages and array format
        const qualityData = Array.from(dateToQuality.entries())
            .map(([date, metrics]) => ({
                date,
                commentPercentage: metrics.count ? metrics.commentPercentage / metrics.count : 0,
                complexity: metrics.count ? metrics.complexity / metrics.count : 0
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Only generate quality chart if we have data
        if (qualityData.length > 0) {
            // Draw complexity and comment percentage lines
            const maxComplexity = Math.max(...qualityData.map(d => d.complexity), 1);
            const chartWidth = 700;
            const chartHeight = 300;
            const xScale = chartWidth / (qualityData.length - 1 || 1);

            // Draw axes
            qualityCanvas
                .line(50, 50, 50, 350)
                .stroke({ width: 1, color: '#888' });
            qualityCanvas
                .line(50, 350, 750, 350)
                .stroke({ width: 1, color: '#888' });

            // Draw complexity line
            const complexityLine = qualityCanvas.polyline().fill('none').stroke({ width: 2, color: '#E74C3C' });
            qualityData.forEach((point, i) => {
                const x = 50 + i * xScale;
                const y = 350 - (point.complexity / maxComplexity) * chartHeight;
                if (i === 0) {
                    complexityLine.plot(`${x},${y}`);
                } else {
                    complexityLine.plot(complexityLine.array().toString() + ` ${x},${y}`);
                }
            });

            // Add a line for comment percentage
            const maxCommentPercentage = Math.max(...qualityData.map(d => d.commentPercentage), 1);
            const commentLine = qualityCanvas.polyline().fill('none').stroke({ width: 2, color: '#2ECC71' });
            qualityData.forEach((point, i) => {
                const x = 50 + i * xScale;
                const y = 350 - (point.commentPercentage / maxCommentPercentage) * chartHeight;
                if (i === 0) {
                    commentLine.plot(`${x},${y}`);
                } else {
                    commentLine.plot(commentLine.array().toString() + ` ${x},${y}`);
                }
            });

            // Add legend
            qualityCanvas
                .rect(10, 10)
                .move(600, 50)
                .fill('#E74C3C');
            qualityCanvas
                .text('Complexity')
                .move(620, 50)
                .font({ size: 12 });
                
            qualityCanvas
                .rect(10, 10)
                .move(600, 70)
                .fill('#2ECC71');
            qualityCanvas
                .text('Comments %')
                .move(620, 70)
                .font({ size: 12 });

            // Save quality chart
            fs.writeFileSync(
                path.join(visualizationsDir, 'code-quality.svg'),
                qualityCanvas.svg()
            );
        } else {
            console.log('No code quality data available yet for visualization');
            // Create an empty placeholder chart
            qualityCanvas
                .text('No code quality data available yet')
                .move(400, 200)
                .font({ size: 14, anchor: 'middle' });
                
            fs.writeFileSync(
                path.join(visualizationsDir, 'code-quality.svg'),
                qualityCanvas.svg()
            );
        }

        console.log('Visualizations generated successfully');
    } catch (error) {
        console.error('Error generating visualizations:', error);
        throw error;
    }
}

// Export for CommonJS
module.exports = { generateVisualizations };

// Call if running directly
if (require.main === module) {
    generateVisualizations().catch(error => {
        console.error('Failed to generate visualizations:', error);
        process.exit(1);
    });
}