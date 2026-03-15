const ACTIVITY_REPO = 'activity-tracker';
const PROFILE_REPO = 'Sonkarrushikesh22';
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
        
        const visualizationsUrl = `https://raw.githubusercontent.com/${username}/${ACTIVITY_REPO}/main/visualizations`;
        console.log(`Visualizations URL: ${visualizationsUrl}`);
        
        const content = [
            `# ${username}`,
            '',
            '## Coding Activity',
            '',
            'This profile uses a dedicated activity repository to store logs and generated profile visuals.',
            '',
            `Data source: https://github.com/${username}/${ACTIVITY_REPO}`,
            '',
            `![Activity Summary](${visualizationsUrl}/summary-card.svg)`,
            '',
            '### Activity Heatmap',
            `![Activity Heatmap](${visualizationsUrl}/heatmap.svg)`,
            '',
            '### Project Progress',
            `![Project Activity](${visualizationsUrl}/activity-chart.svg)`,
            '',
            `Last setup sync: ${new Date().toUTCString()}`
        ].join('\n');
        console.log('Generated README content');

        // Update the profile README
        const currentContent = await getRepoContent(username, PROFILE_REPO, 'README.md');
        await updateRepoContent(
            username,
            PROFILE_REPO,
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