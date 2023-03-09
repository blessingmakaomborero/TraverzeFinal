module.exports = {
	// At every 30th minute.
	'*/30 * * * *': () => {
		strapi.plugins['instagram-feed'].services[
			'instagram-feed'
		].fetchInstagramFeed();
	},

    // At every 30th minute
'*/30 * * * *': () => {
    strapi.plugins.instagram.services.instagramupdater.default.fetchFeed();
},

// At 00:00
'0 0 * * *': () => {
    strapi.plugins.instagram.services.instagramtokenrefresher.default.refreshToken();
},
};