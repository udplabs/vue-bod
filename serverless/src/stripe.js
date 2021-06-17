"use strict"

const axios = require('axios');
const udpBaseUrl = process.env.UDP_BASE_URL;
const issuer = process.env.ISSUER;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

exports.webhook = async function (event, context, callback) {
  let subdomain = event.headers.origin;
  subdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];

  let response = {
    statusCode: 200,
    body: 'ok'
  }
  const eventBody = JSON.parse(event.body);

  try {
    const ccRes = await axios.post(issuer + '/v1/token', 'grant_type=client_credentials&scope=secrets:read', {
      headers: {
        Authorization: 'Basic ' + basicAuth(clientId, clientSecret)
      }
    })
    const subRes = await axios.get(udpBaseUrl + '/api/subdomains/' + subdomain, {
      headers: {
        'Authorization': 'Bearer ' + ccRes.data.access_token
      }
    })
    const ssws = subRes.data.okta_api_token;
    const baseUrl = subRes.data.okta_org_name;

    const configRes = await axios.get(udpBaseUrl + '/api/configs/' + subdomain + '/bod');
    const stripeKey = configRes.data.settings.stripeKey;
    const webhookSecret = configRes.data.settings.stripeWebhookSecret;
    if ((stripeKey && stripeKey.length > 0)) {
      const stripe = require('stripe')(stripeKey);
      let data;
      let eventType;
      if (webhookSecret) {
        let signature = event.headers.stripe - signature;
        try {
          const stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            signature,
            webhookSecret
          );
          // Extract the object from the event.
          data = stripeEvent.data;
          eventType = stripeEvent.type;
        } catch (err) {
          console.log(err);
          const msg = `⚠️  Webhook signature verification failed.`;
          response.statusCode = 400;
          response.body = JSON.stringify(msg);
        }
      } else {
        // Webhook signing is recommended, but if the secret is not configured in `config.js`,
        // retrieve the event data directly from the request body.
        data = eventBody.data;
        eventType = eventBody.type;
      }
  
      switch (eventType) {
        case 'checkout.session.completed':
          // Payment is successful and the subscription is created.
          // You should provision the subscription.  
          try {
            const requestHeaders = {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': 'SSWS ' + ssws
            }    
            let user = {
              profile: {
                stripeCustomerId: data.object.customer
              }
            };
            await axios({
              method: 'POST',
              headers: requestHeaders,
              url: baseUrl + '/api/v1/users/' + data.object.client_reference_id,
              data: user
            });
          } catch(e) {
            console.log(e);
          }
          break;
        case 'invoice.paid':
          // Continue to provision the subscription as payments continue to be made.
          // Store the status in your database and check when a user accesses your service.
          // This approach helps you avoid hitting rate limits.
          break;
        case 'invoice.payment_failed':
          // The payment failed or the customer does not have a valid payment method.
          // The subscription becomes past_due. Notify your customer and send them to the
          // customer portal to update their payment information.
          break;
        default:
        // Unhandled event type
      }
      callback(null, response);
    } else {
      // stripe is not configured
      callback(null, response);
    }
  } catch(err) {
    response.statusCode = 400;
    response.body = JSON.stringify(err.response.data);
    callback(null, response)
  }
}