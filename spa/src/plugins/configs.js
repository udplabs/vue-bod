import WellKnownConfigs from '@/services/api/WellKnownConfigs'

class Configs {
  constructor(config) {
    this.appConfig = config;
    if (!this.appConfig.oidc.redirectUri) this.appConfig.oidc.redirectUri = 'http://localhost:8080/login/callback'
    if (!this.appConfig.bod_api) this.appConfig.bod_api = 'http://localhost:3000/dev'

    this.subdomain = window.location.host.split('.')[0];
    this.appConfig.isRunningLocal = (/^localhost:\d{4}$/.test(this.subdomain));
    if (this.appConfig.mock_subdomain) this.subdomain = this.appConfig.mock_subdomain;

    this.config = null;
  }
  async getConfig() {
    if (this.config) return this.config;

    if (!this.appConfig.isRunningLocal || (this.appConfig.mock_subdomain && this.appConfig.mock_subdomain.length > 0)) {
      const data = await WellKnownConfigs.getWellKnownConfigs(this.subdomain)
      if (data) {
        // Successfully read environment values from the UDP api. Populate the config with it.
        this.appConfig.base_url = data.okta_org_name
        this.appConfig.oidc.issuer = data.issuer
        this.appConfig.oidc.clientId = data.client_id
        this.appConfig.oidc.redirectUri = this.appConfig.isRunningLocal ? this.appConfig.oidc.redirectUri : data.redirect_uri
        this.appConfig.social.fb = data.fbId
        this.appConfig.prospect_group_id = data.prospect_group_id
        this.appConfig.customer_group_id = data.customer_group_id
        this.appConfig.client2_id = data.client2_id
        this.appConfig.stripePublishableKey = data.stripePublishableKey
      }
    }
    this.config = {
      issuer: this.appConfig.oidc.issuer,
      clientId: this.appConfig.oidc.clientId,
      redirectUri: this.appConfig.oidc.redirectUri,
      scopes: this.appConfig.oidc.scopes,
      pkce: true
    }
    return this.config;
  }
  async getAppConfig() {
    if (!this.config) {
      await this.getConfig();
    }
    return this.appConfig;
  }
}

function install(Vue, config) {
  Vue.prototype.$configs = new Configs(config)
}

export default {
  install
}