"use strict"

const axios = require('axios');
const basicAuth = require('basic-auth-token');
const udpBaseUrl = process.env.UDP_BASE_URL;
const issuer = process.env.ISSUER;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

exports.handler = async function(event, context, callback) {
    let subdomain = event.headers.origin;
    subdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];

    const eventBody = JSON.parse(event.body);
    if (eventBody.mocksubdomain) subdomain = eventBody.mocksubdomain;

    const response = {
        statusCode: 200,
        body: "ok",
        isBase64Encoded: false,
        headers: {
            "Access-Control-Allow-Origin": "*"
        }
    }

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

      const requestHeaders = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'SSWS ' + ssws
      }

      const userId = event.pathParameters.userId;
      const configRes = await axios.get(udpBaseUrl + '/api/configs/' + subdomain + '/bod');
      const groupid = configRes.data.settings.customer_group_id || '';
      const stripeKey = configRes.data.settings.stripeKey;
      const priceId = configRes.data.settings.stripePriceId;

      let user = {
        profile: {
          login: eventBody.username,
          email: eventBody.username,
          firstName: eventBody.firstName,
          lastName: eventBody.lastName,
          goals: eventBody.goals
        }
      };
      if (eventBody.password) {
        user.credentials = {
          password: { value: eventBody.password }
        }
      }
      // update the user profile (and credentials, if present in the request)
      await axios({
        method: 'POST',
        headers: requestHeaders,
        url: baseUrl + '/api/v1/users/' + userId,
        data: user
      });
      // then add the user to the "customer" group
      await axios({
        method: 'PUT',
        headers: requestHeaders,
        url: baseUrl + '/api/v1/groups/' + groupid + '/users/' + userId
      });


      // Start the Stripe Checkout Session
      if (stripeKey && stripeKey.length > 0) {
        const stripe = require('stripe')(stripeKey);

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: event.headers.origin + '/payment-success',
          cancel_url: event.headers.origin + '/payment-canceled',
          
          // ⚠️: Include a reference to the Okta UserId so that the webhook knows which user to Update
          client_reference_id: userId
        });
        response.body = JSON.stringify({
          stripeSessionId: session.id
        });
      }
    }
    catch(err) {
      response.statusCode = 400;
      response.body = JSON.stringify(err.response.data);
    }
        
    callback(null, response)
}