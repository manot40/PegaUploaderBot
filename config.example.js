const config = {
	// Normally not changed
	folder: 'images',
	silent: true,
	url: 'https://hcc.sinarmas.co.id/prweb',
	// Set pages timeout (in second)
	timeout: 60,
	// Fast login mode, set true to skip login inquirer every time use the bot
	fastLogin: {
		enabled: false,
		username: '',
		password: '',
	},
	jobName: 'Your Job Name',
	// Set true for unique description per post or false for auto generated description
	customDesc: [
		'1726',
		'1727',
		'1728',
		'1729',
		'1730',
		'1731',
	],
	// Make sure to create new folder inside 'images' folder corresponding to your job list
	jobs: [
		'(0001) JOB NAME 1',
		'(0002) JOB NAME 2',
		'(0003) JOB NAME 3',
		'(0004) JOB NAME 4',
		'(0005) JOB NAME 5',
	],
	multiUpload: {
		jobsID: [],
		fileName: [''],
	},
};

module.exports = config;