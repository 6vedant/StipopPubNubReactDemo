export default (request, response) => {
  const pubnub = require("pubnub");
  const vault = require("vault");
  const xhr = require("xhr");
  const db = require("kvstore");

  const functions_config = {
    env: [
      { name: "API_URI", value: "https://bapi.stipop.io/v1/package/best/en" },
      { name: "API_KEY_IDENTIFIER", value: "STIPOP_APIKEY" },
      { name: "PN_CHANNEL", value: "Introductions" },
      { name: "CACHE_TTL", value: 1 }
    ],
    secrets: ["STIPOP_APIKEY"],
    logger: {}
  };

  const env = env_var_name => {
    return new Promise((resolve, reject) => {
      let val = functions_config["env"].filter(function (env) {
        return env.name === env_var_name;
      });
      if (val.length == 1) {
        val = functions_config["env"].filter(function (env) {
          return env.name === env_var_name;
        })[0].value;
        resolve(val);
      } else {
        reject();
      }
    });
  };

  return Promise.all([
    env("API_URI"),
    env("API_KEY_IDENTIFIER"),
    env("PN_CHANNEL"),
    env("CACHE_TTL")
  ])
    .then(function (result) {
      const API_URI = result[0];
      const API_KEY_IDENTIFIER = result[1];
      const PN_CHANNEL = result[2];
      const CACHE_TTL = result[3];
      return Promise.all([vault.get(API_KEY_IDENTIFIER), db.get(API_URI)])
        .then(result => {
          const API_KEY = result[0];
          const CACHED_CONTENT = result[1];

          if (
            CACHED_CONTENT &&
            (CACHED_CONTENT !== null || CACHED_CONTENT !== undefined)
          ) {
            return pubnub
              .publish({ channel: PN_CHANNEL, message: CACHED_CONTENT })
              .then(publishedResponse => {
                return response.send(CACHED_CONTENT);
              });
          }

          const CONTENT_TYPE = "application/json";
          const API_METHOD = "get";

          const http_options = {
            Accept: CONTENT_TYPE,
            "Content-Type": CONTENT_TYPE,
            "Access-Control-Allow-Origin": "*",
            apikey: API_KEY
          };

          return xhr
            .fetch(API_URI, { headers: http_options, method: API_METHOD })
            .then(response => response.json())
            .then(responseJson => {
              db.set(API_URI, responseJson, CACHE_TTL);
              return pubnub
                .publish({ channel: PN_CHANNEL, message: responseJson })
                .then(publishedResponse => {
                  return response.send(responseJson);
                });
            })
            .catch(err => {
              console.log(err);
              response.status = 400;
              return response.send("Bad Request: Malformed JSON body.");
            });
        })
        .catch(err => {
          console.log(err);
          response.status = 400;
          return response.send("Bad Request: Vault Error");
        });
    })
    .catch(err => {
      console.log(err);
      response.status = 400;
      return response.send("bad environment setup");
    });
};
