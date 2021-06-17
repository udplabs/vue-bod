import axios from 'axios';
import oktaAuthConfig from '@/.config.js'

export default {
	getWellKnownConfigs(subdomain) {
		if (!oktaAuthConfig.udp_api)
			return false;

		return axios.get(oktaAuthConfig.udp_api + '/api/configs/' + subdomain  + '/bod')
		.then((res) => {
			var result = {
				issuer: '',
				base_url: '',
				client_id: '',
				redirect_uri: '',
				fbId: '',
				prospect_group_id: '',
				customer_group_id: '',
				client2_id: '',
				stripePublishableKey: undefined,
				stripeKey: undefined,
				stripePriceId: undefined,
				stripeWebhookSecret: undefined,
			};
      const data = res.data;
			if (Object.keys(data).length > 0) {
				result.issuer=data.issuer;
				result.base_url=data.okta_org_name;
				result.client_id=data.client_id;
				result.redirect_uri=data.redirect_uri;
				result.fbId=data.settings.fbId;
				result.prospect_group_id=data.settings.prospect_group_id;
				result.customer_group_id=data.settings.customer_group_id;
				result.client2_id=data.settings.client2_id;
				result.stripePublishableKey=data.settings.stripePublishableKey;
				result.stripeKey=data.settings.stripeKey;
				result.stripePriceId=data.settings.stripePriceId;
				result.stripeWebhookSecret=data.settings.stripeWebhookSecret;
			}
			return result;
		})
		.catch(err => {
			// could not read the config from UDP. 
			return false;
		});
	}
}

