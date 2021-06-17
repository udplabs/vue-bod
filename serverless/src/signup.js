"use strict"

const axios = require('axios');
const basicAuth = require('basic-auth-token');
const udpBaseUrl = process.env.UDP_BASE_URL;
const issuer = process.env.ISSUER;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

const generatePassword = require('password-generator');
const maxLength = 18;
const minLength = 8;
const uppercaseMinCount = 1;
const lowercaseMinCount = 1;
const numberMinCount = 1;
const specialMinCount = 1;
const UPPERCASE_RE = /([A-Z])/g;
const LOWERCASE_RE = /([a-z])/g;
const NUMBER_RE = /([\d])/g;
const SPECIAL_CHAR_RE = /([\?\-])/g;

exports.handler = async function (event, context, callback) {
    var subdomain = event.headers.origin;
    subdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];

    const eventBody = JSON.parse(event.body);
    if (eventBody.mocksubdomain) subdomain = eventBody.mocksubdomain;

    const un = eventBody.username;
    const name = eventBody.name || '';
    const fn = name.split(' ')[0];
    const ln = name.split(' ')[1] || '!';
    let profile = {
        firstName: fn,
        lastName: ln,
        email: un,
        login: un
    }
    let groupIds = [];

    let response = {
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
      const oktaBaseUrl = subRes.data.okta_org_name;

      const configRes = await axios.get(udpBaseUrl + '/api/configs/' + subdomain + '/bod');
      groupIds.push(configRes.data.settings.prospect_group_id || '');
    

      let metaRes = await axios.get(oktaBaseUrl + '/api/v1/meta/schemas/user/default', {
        headers: {
          Authorization: 'SSWS ' + ssws
        }
      })
      if (metaRes.data.definitions.custom.properties.numFreebiesAvailable)
        profile.numFreebiesAvailable = 3;

      // let pw = "Atko123456789#";
      let pw = null;
      // If password is present, then request is coming in from the Register View
      if (eventBody.password != undefined) {
        pw = eventBody.password;
        groupIds.push(configRes.data.settings.customer_group_id || '');
        profile.firstName = eventBody.firstName;
        profile.lastName = eventBody.lastName;
        profile.goals = eventBody.goals;
        profile.zipCode = eventBody.zip;
      } else {
      /*
        * An Okta user requires a password in order to authenticate. In our case, the user
        * does not provide a password yet. So we simply seed a random password to Okta
        */
      pw = customPassword();
      }

      const user = {
        profile: profile,
        groupIds: groupIds,
        credentials: {
          password: {
            value: pw
          }
        }
      }
      const status = await userCreatePromise(user, oktaBaseUrl, ssws);
      response.statusCode = status;
      if (status == 201) {
        const authnRes = await authnPromise(oktaBaseUrl, un, pw);
        response.body = JSON.stringify({
          sessionToken: authnRes.sessionToken
        })
      } else {
        response.body = JSON.stringify({
          err: 'duplicate email'
        })
      }    
    } catch (err) {
      response.statusCode = 400;
      response.body = JSON.stringify(err.response.data);
    }

    console.log(response);
    callback(null, response);
}

function isStrongEnough(password) {
  const uc = password.match(UPPERCASE_RE);
  const lc = password.match(LOWERCASE_RE);
  const n = password.match(NUMBER_RE);
  const sc = password.match(SPECIAL_CHAR_RE);
  return password.length >= minLength &&
    uc && uc.length >= uppercaseMinCount &&
    lc && lc.length >= lowercaseMinCount &&
    n && n.length >= numberMinCount &&
    sc && sc.length >= specialMinCount;
}

function customPassword() {
  let password = "";
  const randomLength = Math.floor(Math.random() * (maxLength - minLength)) + minLength;
  while (!isStrongEnough(password)) {
    password = generatePassword(randomLength, false, /[\w\d\?\-]/);
  }
  return password;
}

function userCreatePromise(user, oktaBaseUrl, ssws) {
    return new Promise((resolve, reject) => {
        axios({
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'SSWS ' + ssws
                },
                url: oktaBaseUrl + '/api/v1/users?activate=true',
                data: user
            })
            .then(res => {
                console.log('userCreatePromise:');
                console.log(res);
                resolve(201);
            })
            .catch(err => {
                console.log('ERROR');
                const data = JSON.stringify(err.response.data);
                console.log(data);
                if (data.includes('already exists')) {
                    resolve(204);
                } else {
                    resolve(400);
                }
            })
    })
}

function authnPromise(baseUrl, un, pw) {
    return new Promise((resolve, reject) => {
        axios({
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                url: baseUrl + '/api/v1/authn',
                data: {
                    username: un,
                    password: pw
                }
            })
            .then((res) => {
                console.log('authnPromise:');
                console.log(res.data);
                resolve(res.data);
            })
            .catch((err) => {
                reject(err);
            })
    })
}