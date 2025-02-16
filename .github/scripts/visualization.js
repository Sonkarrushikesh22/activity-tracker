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