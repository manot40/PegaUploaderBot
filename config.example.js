const config = {
	// Normally not changed
	folder: 'images',
	url: 'https://hcc.sinarmas.co.id',
	// Set true for unique description per post or false for auto generated description
	customDesc: false,
	// Fast login mode, set true to skip login inquirer every time use the bot
	fastLogin: {
		enabled: false,
		username: '',
		password: '',
	},
	jobName: 'Checklist Bot',
	// Make sure to create new folder inside 'images' folder corresponding to your job list
	jobs: [
		'(0001) JOB NAME 1',
		'(0002) JOB NAME 2',
		'(0003) JOB NAME 3',
		'(0004) JOB NAME 4',
		'(0005) JOB NAME 5',
	],
};

module.exports = config;