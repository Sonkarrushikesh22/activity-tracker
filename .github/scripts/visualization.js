const fs = require('fs');
const path = require('path');

function getDateKey(value) {
    return new Date(value).toISOString().split('T')[0];
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatCompactNumber(value) {
    return Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
}

function trimLabel(label, maxLength = 18) {
    return label.length <= maxLength
        ? label
        : `${label.slice(0, maxLength - 1)}...`;
}

function getFileDisplayName(label) {
    const normalized = label.replace(/\\/g, '/');
    return path.posix.basename(normalized) || normalized;
}

function getFileContext(label) {
    const normalized = label.replace(/\\/g, '/');
    const parts = normalized.split('/');

    if (parts.length <= 1) {
        return '';
    }

    return trimLabel(parts.slice(0, -1).join('/'), 24);
}

function addText(canvas, text, x, y, options = {}) {
    const {
        size = 12,
        family = 'Segoe UI',
        weight = '400',
        fill = '#f8fafc'
    } = options;

    return canvas.plain(text)
        .move(x, y)
        .font({ size, family, weight })
        .fill(fill);
}

function drawMetricPill(canvas, x, y, text, options = {}) {
    const {
        width = 86,
        fill = '#18243b',
        textColor = '#cbd5e1'
    } = options;

    canvas.rect(width, 22)
        .move(x, y)
        .radius(11)
        .fill(fill)
        .stroke({ color: '#22304f', width: 1 });
    addText(canvas, text, x + 12, y + 5, {
        size: 11,
        weight: '600',
        fill: textColor
    });
}

function createCanvasFactory(createSVGWindow, SVG, registerWindow) {
    return (width, height) => {
        const window = createSVGWindow();
        const document = window.document;
        registerWindow(window, document);

        const canvas = SVG(document.documentElement);
        canvas.size(width, height);
        canvas.viewbox(0, 0, width, height);
        canvas.rect(width, height).fill('#0f172a');
        return canvas;
    };
}

function loadActivityLogs(projectsDir) {
    let allActivity = [];

    if (!fs.existsSync(projectsDir)) {
        return allActivity;
    }

    const projects = fs.readdirSync(projectsDir)
        .filter(file => fs.statSync(path.join(projectsDir, file)).isDirectory());

    for (const project of projects) {
        const logPath = path.join(projectsDir, project, 'activity-log.json');
        if (!fs.existsSync(logPath)) {
            continue;
        }

        try {
            const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            allActivity = allActivity.concat(logs);
        } catch (error) {
            console.warn(`Warning: Could not parse log file for project ${project}:`, error);
        }
    }

    return allActivity;
}

function aggregateActivity(allActivity) {
    const activityByDate = new Map();
    const projectStats = new Map();
    const languageStats = new Map();
    const fileStats = new Map();

    for (const entry of allActivity) {
        const dateKey = getDateKey(entry.timestamp);
        const score = entry.metrics?.activityScore || 1;
        const lineImpact = (
            (entry.metrics?.addedLines || 0) +
            (entry.metrics?.removedLines || 0) +
            (entry.metrics?.modifiedLines || 0)
        );
        const projectName = entry.project || 'Unknown';
        const languageName = entry.language || 'plain-text';
        const fileName = entry.relativeFile || entry.file || 'Unknown file';

        activityByDate.set(dateKey, (activityByDate.get(dateKey) || 0) + score);

        const projectEntry = projectStats.get(projectName) || {
            name: projectName,
            score: 0,
            saves: 0,
            lines: 0
        };
        projectEntry.score += score;
        projectEntry.saves += 1;
        projectEntry.lines += lineImpact;
        projectStats.set(projectName, projectEntry);

        const languageEntry = languageStats.get(languageName) || {
            name: languageName,
            score: 0,
            saves: 0
        };
        languageEntry.score += score;
        languageEntry.saves += 1;
        languageStats.set(languageName, languageEntry);

        const fileEntry = fileStats.get(fileName) || {
            name: fileName,
            score: 0,
            saves: 0,
            lines: 0
        };
        fileEntry.score += score;
        fileEntry.saves += 1;
        fileEntry.lines += lineImpact;
        fileStats.set(fileName, fileEntry);
    }

    const sortedProjects = Array.from(projectStats.values())
        .sort((left, right) => right.score - left.score);
    const sortedLanguages = Array.from(languageStats.values())
        .sort((left, right) => right.score - left.score);
    const sortedFiles = Array.from(fileStats.values())
        .sort((left, right) => right.score - left.score);
    const totalLinesChanged = allActivity.reduce((sum, entry) => (
        sum +
        (entry.metrics?.addedLines || 0) +
        (entry.metrics?.removedLines || 0) +
        (entry.metrics?.modifiedLines || 0)
    ), 0);

    const now = new Date();
    const today = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    ));

    let currentStreak = 0;
    for (let offset = 0; offset < 365; offset += 1) {
        const date = new Date(today);
        date.setUTCDate(today.getUTCDate() - offset);
        if (activityByDate.has(getDateKey(date))) {
            currentStreak += 1;
        } else if (offset > 0) {
            break;
        }
    }

    return {
        activityByDate,
        sortedProjects,
        sortedLanguages,
        sortedFiles,
        totalSessions: allActivity.length,
        activeDays: activityByDate.size,
        totalLinesChanged,
        filesTouched: fileStats.size,
        currentStreak,
        today
    };
}

function renderSummaryCard(createCanvas, metrics, visualizationsDir) {
    const canvas = createCanvas(960, 160);
    addText(canvas, 'Coding Activity Snapshot', 40, 24, {
        size: 24,
        weight: '700'
    });
    addText(canvas, 'A compact overview generated from local VS Code activity logs.', 40, 56, {
        size: 12,
        fill: '#94a3b8'
    });

    const cards = [
        { label: 'Tracked saves', value: formatCompactNumber(metrics.totalSessions), accent: '#38bdf8' },
        { label: 'Active days', value: formatCompactNumber(metrics.activeDays), accent: '#22c55e' },
        { label: 'Lines changed', value: formatCompactNumber(metrics.totalLinesChanged), accent: '#f97316' },
        { label: 'Current streak', value: `${metrics.currentStreak} day${metrics.currentStreak === 1 ? '' : 's'}`, accent: '#facc15' }
    ];

    cards.forEach((card, index) => {
        const x = 40 + (index * 220);
        canvas.rect(200, 68)
            .move(x, 84)
            .radius(14)
            .fill('#111c35')
            .stroke({ color: '#1e293b', width: 1 });
        canvas.rect(6, 40)
            .move(x + 16, 98)
            .radius(3)
            .fill(card.accent);
        addText(canvas, card.value, x + 34, 94, {
            size: 22,
            weight: '700'
        });
        addText(canvas, card.label, x + 34, 124, {
            size: 12,
            fill: '#94a3b8'
        });
    });

    fs.writeFileSync(path.join(visualizationsDir, 'summary-card.svg'), canvas.svg());
}

function renderHeatmap(createCanvas, metrics, visualizationsDir) {
    const canvas = createCanvas(960, 260);
    canvas.rect(880, 196)
        .move(40, 32)
        .radius(18)
        .fill('#111c35')
        .stroke({ color: '#22304f', width: 1 });
    addText(canvas, 'Activity Heatmap', 64, 52, {
        size: 22,
        weight: '700'
    });
    addText(canvas, 'Daily activity across the last 52 weeks.', 64, 82, {
        size: 12,
        fill: '#94a3b8'
    });

    const palette = ['#243145', '#123524', '#166534', '#22c55e', '#86efac'];
    const cellSize = 10;
    const cellGap = 3;
    const gridLeft = 96;
    const gridTop = 108;
    const weeks = 52;
    const gridStart = new Date(metrics.today);
    gridStart.setUTCDate(metrics.today.getUTCDate() - ((weeks * 7) - 1));
    const maxDayScore = Math.max(...metrics.activityByDate.values(), 1);
    const monthLabels = new Set();

    ['Mon', 'Wed', 'Fri'].forEach((label, index) => {
        addText(canvas, label, 52, gridTop + 2 + (index * 2 * (cellSize + cellGap)), {
            size: 11,
            fill: '#64748b'
        });
    });

    for (let weekIndex = 0; weekIndex < weeks; weekIndex += 1) {
        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
            const date = new Date(gridStart);
            date.setUTCDate(gridStart.getUTCDate() + (weekIndex * 7) + dayIndex);
            const dateKey = getDateKey(date);
            const score = metrics.activityByDate.get(dateKey) || 0;
            const intensity = score === 0 ? 0 : clamp(Math.ceil((score / maxDayScore) * 4), 1, 4);
            const x = gridLeft + (weekIndex * (cellSize + cellGap));
            const y = gridTop + (dayIndex * (cellSize + cellGap));

            canvas.rect(cellSize, cellSize)
                .move(x, y)
                .radius(4)
                .fill(palette[intensity])
                .stroke({ color: '#1e293b', width: 1 });

            if (date.getUTCDate() === 1) {
                const monthLabel = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
                    const monthKey = `${monthLabel}-${weekIndex}`;
                    if (!monthLabels.has(monthKey)) {
                        monthLabels.add(monthKey);
                        addText(canvas, monthLabel, x, 90, {
                            size: 11,
                            fill: '#64748b'
                        });
                    }
                }
            }
    }

    addText(canvas, 'Less', 720, 52, {
        size: 11,
        fill: '#94a3b8'
    });
    palette.forEach((color, index) => {
        canvas.rect(12, 12)
            .move(754 + (index * 18), 50)
            .radius(4)
            .fill(color)
            .stroke({ color: '#1e293b', width: 1 });
    });
    addText(canvas, 'More', 850, 52, {
        size: 11,
        fill: '#94a3b8'
    });

    fs.writeFileSync(path.join(visualizationsDir, 'heatmap.svg'), canvas.svg());
}

function renderProjectDashboard(createCanvas, metrics, visualizationsDir) {
    const canvas = createCanvas(960, 620);
    canvas.rect(880, 556)
        .move(40, 32)
        .radius(18)
        .fill('#111c35')
        .stroke({ color: '#22304f', width: 1 });
    addText(canvas, 'Project Progress', 64, 52, {
        size: 22,
        weight: '700'
    });
    addText(canvas, 'Top projects and the files absorbing most of your recent effort.', 64, 82, {
        size: 12,
        fill: '#94a3b8'
    });

    addText(canvas, 'Top projects', 64, 120, {
        size: 16,
        weight: '700'
    });
    addText(canvas, 'Recent files', 64, 372, {
        size: 16,
        weight: '700'
    });

    const topProjects = metrics.sortedProjects.slice(0, 3);
    const maxProjectScore = Math.max(...topProjects.map(project => project.score), 1);

    if (topProjects.length === 0) {
        addText(canvas, 'No activity yet. Save files locally to populate this chart.', 64, 160, {
            size: 14,
            fill: '#94a3b8'
        });
    } else {
        topProjects.forEach((project, index) => {
            const y = 138 + (index * 72);
            const barWidth = (project.score / maxProjectScore) * 640;

            canvas.rect(832, 56)
                .move(64, y - 6)
                .radius(12)
                .fill('#15233d');

            addText(canvas, trimLabel(project.name, 24), 64, y, {
                size: 14,
                weight: '600',
                fill: '#e2e8f0'
            });
            drawMetricPill(canvas, 792, y - 2, `${project.saves} saves`, {
                width: 88,
                fill: '#18243b'
            });

            canvas.rect(700, 10)
                .move(64, y + 24)
                .radius(5)
                .fill('#0f172a');
            canvas.rect(Math.max(barWidth, 10), 10)
                .move(64, y + 24)
                .radius(5)
                .fill('#38bdf8');
            addText(canvas, `${formatCompactNumber(project.score)} score • ${formatCompactNumber(project.lines)} lines`, 64, y + 40, {
                size: 11,
                fill: '#64748b'
            });
        });
    }

    const topFiles = metrics.sortedFiles.slice(0, 3);
    const maxFileScore = Math.max(...topFiles.map(file => file.score), 1);

    if (topFiles.length === 0) {
        addText(canvas, 'File activity appears after the first tracked saves.', 64, 412, {
            size: 13,
            fill: '#94a3b8'
        });
    } else {
        topFiles.forEach((file, index) => {
            const y = 390 + (index * 72);
            const barWidth = (file.score / maxFileScore) * 640;
            const fileName = trimLabel(getFileDisplayName(file.name), 18);
            const fileContext = getFileContext(file.name);

            canvas.rect(832, 56)
                .move(64, y - 6)
                .radius(12)
                .fill('#15233d');

            addText(canvas, fileName, 64, y, {
                size: 14,
                weight: '600',
                fill: '#e2e8f0'
            });
            drawMetricPill(canvas, 792, y - 2, `${file.saves} saves`, {
                width: 82,
                fill: '#20193f'
            });
            if (fileContext) {
                addText(canvas, fileContext, 64, y + 18, {
                    size: 10,
                    fill: '#64748b'
                });
            }
            canvas.rect(700, 10)
                .move(64, y + 24)
                .radius(5)
                .fill('#0f172a');
            canvas.rect(Math.max(barWidth, 10), 10)
                .move(64, y + 24)
                .radius(5)
                .fill('#8b5cf6');
            addText(canvas, `${formatCompactNumber(file.lines)} lines • ${formatCompactNumber(file.score)} score`, 64, y + 40, {
                size: 11,
                fill: '#64748b'
            });
        });
    }

    fs.writeFileSync(path.join(visualizationsDir, 'activity-chart.svg'), canvas.svg());
}

async function generateVisualizations() {
    try {
        const [svgdomModule, svgjsModule] = await Promise.all([
            import('svgdom'),
            import('@svgdotjs/svg.js')
        ]);

        const { createSVGWindow } = svgdomModule;
        const { SVG, registerWindow } = svgjsModule;
        const createCanvas = createCanvasFactory(createSVGWindow, SVG, registerWindow);

        const projectsDir = path.join(process.cwd(), 'projects');
        const visualizationsDir = path.join(process.cwd(), 'visualizations');

        if (!fs.existsSync(visualizationsDir)) {
            fs.mkdirSync(visualizationsDir, { recursive: true });
        }

        const allActivity = loadActivityLogs(projectsDir);
        const metrics = aggregateActivity(allActivity);

        renderSummaryCard(createCanvas, metrics, visualizationsDir);
        renderHeatmap(createCanvas, metrics, visualizationsDir);
        renderProjectDashboard(createCanvas, metrics, visualizationsDir);

        console.log('Visualizations generated successfully');
    } catch (error) {
        console.error('Error generating visualizations:', error);
        throw error;
    }
}

module.exports = { generateVisualizations };

if (require.main === module) {
    generateVisualizations().catch(error => {
        console.error('Failed to generate visualizations:', error);
        process.exit(1);
    });
}
