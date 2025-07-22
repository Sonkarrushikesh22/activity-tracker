const fs = require('fs');
const path = require('path');
const https = require('https');

async function updateProfile() {
    try {
        console.log('Starting profile update...');
        
        if (!process.env.GITHUB_REPOSITORY) {
            throw new Error('GITHUB_REPOSITORY environment variable not found');
        }
        if (!process.env.GITHUB_TOKEN) {
            throw new Error('GITHUB_TOKEN environment variable not found');
        }
        
        // Get authenticated username for both profile and activity tracker repos
        const username = await getAuthenticatedUsername(process.env.GITHUB_TOKEN);
        console.log(`Authenticated username: ${username}`);
        
        // Construct the correct URL for visualizations from the activity-tracker repo
        const visualizationsUrl = `https://raw.githubusercontent.com/${username}/activity-tracker/main`;
        console.log(`Visualizations URL: ${visualizationsUrl}`);
        
        const content = [
            '# Coding Activity Overview',
            '',
            '## Recent Coding Activity',
            '',
            '### Activity Heatmap',
            `![Activity Heatmap](${visualizationsUrl}/visualizations/heatmap.svg)`,
            '',
            '### Project Activity',
            `![Project Activity](${visualizationsUrl}/visualizations/activity-chart.svg)`,
            '',
            `Last updated: ${new Date().toUTCString()}`
        ].join('\n');
        console.log('Generated README content');

        // Update the profile README
        const currentContent = await getRepoContent(username, username, 'README.md');
        await updateRepoContent(
            username,
            username,
            'README.md',
            'Update coding activity visualizations',
            content,
            currentContent ? currentContent.sha : null
        );
        console.log('Profile README updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        throw error;
    }
}

async function getAuthenticatedUsername(token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/user',
            headers: {
                'User-Agent': 'Activity-Tracker',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        };
        
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const userData = JSON.parse(data);
                    resolve(userData.login);
                } else {
                    reject(new Error(`Failed to get username: ${res.statusCode} - ${data}`));
                }
            });
        }).on('error', reject);
    });
}

async function getRepoContent(owner, repo, path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/' + owner + '/' + repo + '/contents/' + path,
            headers: {
                'User-Agent': 'Activity-Tracker',
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 404) {
                    resolve(null);
                } else if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Failed to get content: ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

async function updateRepoContent(owner, repo, path, message, content, sha = null) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            message,
            content: Buffer.from(content).toString('base64'),
            sha: sha
        });

        const options = {
            hostname: 'api.github.com',
            path: '/repos/' + owner + '/' + repo + '/contents/' + path,
            method: 'PUT',
            headers: {
                'User-Agent': 'Activity-Tracker',
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    resolve(JSON.parse(responseData));
                } else {
                    reject(new Error(`Failed to update content: ${responseData}`));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Export and execute
if (require.main === module) {
    updateProfile().catch(error => {
        console.error('Script execution failed:', error.message || String(error));
        process.exit(1);
    });
} else {
    module.exports = { updateProfile };
}