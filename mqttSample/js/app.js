/*
Copyright 2016-2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://aws.amazon.com/apache2.0/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/
(function() {
  'use strict';

  function LogMsg(type, content) {
    this.type = type;
    this.content = content;
    this.createdTime = Date.now();
    if (this.type === 'success') {
      this.className = 'list-group-item-info';
    } else {
      this.className = 'list-group-item-danger';
    }
  }

  function LogService() {
    this.logs = [];
  }

  LogService.prototype.log = function (msg) {
    var logObj = new LogMsg('success', msg);
    this.logs.push(logObj);
  };

  LogService.prototype.logError = function (msg) {
    var logObj = new LogMsg('error', msg);
    this.logs.push(logObj);
  };

  /**
   * wrapper of received paho message
   * @class
   * @param {Paho.MQTT.Message} msg
   */
  function ReceivedMsg(msg) {
    this.msg = msg;
    this.content = msg.payloadString;
    this.destination = msg.destinationName;
    this.receivedTime = Date.now();
  }

  /** controller of the app */
  function AppController(scope, $q, $timeout) {
    this.email = '';
    this.password = 'X';
    this.clientId = 'X';
    this.endpoint = 'X';
    this.accessKey = '';
    this.secretKey = '';
    this.sessionToken = '';
    this.regionName = 'X';
    this.logs = new LogService();
    this.clients = new ClientControllerCache(scope, this.logs);
    this.$q = $q;
    this.$timeout = $timeout;
    this.$scope = scope;
  }

  AppController.$inject = ['$scope', '$q', '$timeout'];


  AppController.prototype.computeUrl = function (options) {
    // must use utc time
    // var time = moment.utc();
    // var dateStamp = time.format('YYYYMMDD');
    // var amzdate = dateStamp + 'T' + time.format('HHmmss') + 'Z';
    // var algorithm = 'AWS4-HMAC-SHA256';

    var protocol = 'wss';
    var host = options.endpoint;
    var canonicalUri = '/mqtt';
    var service = 'iotdevicegateway';
    var region = options.regionName;
    var accessKey = options.accessKey;
    var secretKey = options.secretKey;
    var sessionToken = options.sessionToken;

    var requestUrl = SigV4Utils.getSignedUrl(protocol, host, canonicalUri,
      service, region, accessKey, secretKey, sessionToken);

    console.log("v2 SigV4Utils requestUrl: " + requestUrl);
    return requestUrl;
  };

  AppController.prototype.createClientMqtt = function () {
    var options = {
      clientId: this.clientId,
      endpoint: this.endpoint.toLowerCase(),
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      regionName: this.regionName,
      sessionToken: this.sessionToken,
      type: "mqtt.js"
    };
    options.mqttSvrUrl = this.computeUrl(options);
    this.mqttSvrUrl = options.mqttSvrUrl;

    this.client = this.clients.getClient(options);
    this.client.scope = this.$scope;
  };


  AppController.prototype.signin = function() {
    console.log("signin with email " + this.email);
    this.initCognitoUserPool();
    this.submitSignIn(
      {
        email: this.email,
        password: this.password
      }
    )
  };


  AppController.prototype.initCognitoUserPool =  function() {
    var poolData;
    AWSCognito.config.region = 'us-west-2';
    this.cognitoPoolId = 'us-west-2_QqWF8WUcK';
    poolData = {
      UserPoolId: this.cognitoPoolId,
      ClientId: '70gkbkp976e2g7ij9glcj5g4b1',
      Paranoia: 7
    };
    return this.cognitoUserPool = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserPool(poolData);
  }


  AppController.prototype.getPopulatedLogins = function(values) {
    var logins;
    logins = {};
    //logins["cognito-idp:us-west-2:193977405711:userpool/" + this.cognitoPoolId] = values.cognitoToken;
    logins['cognito-idp.us-west-2.amazonaws.com/' + this.cognitoPoolId] = values.cognitoToken;
    return logins;
  }

  AppController.prototype.getUserData = function() {
    return this.retrieveAwsSession().then((function(_this) {
      return function(response) {
        return _this.getCognitoUserData().then(function(result) {
          _this.deferred.resolve(_this);
        });
      };
    })(this));
  }

  AppController.prototype.submitSignIn = function(user) {
    var authenticationData, authenticationDetails, deferredInner, deferredToOuter, innerPromise, toOuterPromise, userData;
    var $q = this.$q;
    deferredInner = $q.defer();
    deferredToOuter = $q.defer();
    innerPromise = deferredInner.promise;
    toOuterPromise = deferredToOuter.promise;
    authenticationData = {
      Username: user.email.toLocaleLowerCase(),
      Password: user.password
    };
    authenticationDetails = new AWSCognito.CognitoIdentityServiceProvider.AuthenticationDetails(authenticationData);
    userData = {
      Username: user.email.toLocaleLowerCase(),
      Pool: this.cognitoUserPool
    };
    this.cognitoUser = new AWSCognito.CognitoIdentityServiceProvider.CognitoUser(userData);
    this.cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (function(_this) {
        return function(result) {
          return deferredInner.resolve(result);
        };
      })(this),
      onFailure: function(err) {
        return deferredInner.reject(err);
      }
    });
    innerPromise.then((function(_this) {
      return function(result) {
        console.log("UserModel.submitSignIn promise.then()");


        AWSCognito.config.credentials = new AWSCognito.CognitoIdentityCredentials({
          IdentityPoolId: 'us-west-2:1f76ee12-c023-4d88-aa4f-91c0bef968e3',
          Logins: {
            'cognito-idp.us-west-2.amazonaws.com/us-west-2_QqWF8WUcK': result.getIdToken().getJwtToken()
          }
        });

        AWSCognito.config.credentials.get((function(_this) {
          return function() {
            _this.identityId = AWSCognito.config.credentials.identityId;
            _this.accessKey = AWSCognito.config.credentials.accessKeyId;
            _this.secretKey = AWSCognito.config.credentials.secretAccessKey;
            _this.sessionToken = AWSCognito.config.credentials.sessionToken;
            _this.$timeout(function() {
              return console.log("credentials received");
            });
          };
        })(_this));

        _this.authorizationAwsToken = _this.cognitoUser.signInUserSession.idToken.jwtToken;

        return _this.getCognitoUserData().then(function() {
          return deferredToOuter.resolve(result);
        });
      };
    })(this))["catch"](function(error) {
      console.error("cognitoUser.authenticateUser error:\n" + error.stack);
      alert(error);
      return deferredToOuter.reject(error);
    });
    return toOuterPromise;
  }

  AppController.prototype.retrieveAwsSession = function() {
    var deferred, promise;
    deferred = $q.defer();
    promise = deferred.promise;
    this.cognitoUser = this.cognitoUserPool.getCurrentUser();
    if (this.cognitoUser !== null) {
      this.cognitoUser.getSession((function(_this) {
        return function(err, session) {
          if (err) {
            return deferred.reject(err);
          } else {
            return deferred.resolve(session);
          }
        };
      })(this));
    }
    promise.then((function(_this) {
      return function(session) {
        AWSCognito.config.credentials = new AWSCognito.CognitoIdentityCredentials({
          IdentityPoolId: _this.cognitoPoolId,
          Logins: _this.getPopulatedLogins({
            cognitoToken: session.getIdToken().getJwtToken()
          })
        });
        return _this.authorizationAwsToken = _this.cognitoUser.signInUserSession.idToken.jwtToken;
      };
    })(this));
    return promise;
  }

  AppController.prototype.getCognitoUserData = function() {
    var deferred;
    deferred = this.$q.defer();
    this.cognitoUser.getUserAttributes((function(_this) {
      return function(err, result) {
        var attr, i, len;
        if (err) {
          console.error("getCognitoUserData error");
          console.error(err);
          return deferred.reject(err);
        } else {
          for (i = 0, len = result.length; i < len; i++) {
            attr = result[i];
            _this[attr.Name] = attr.Value;
          }
          _this.first_name = _this.given_name;
          _this.last_name = _this.family_name;
          _this.cognitoSessionIsValid = true;
          return deferred.resolve(result);
        }
      };
    })(this));
    return deferred.promise;
  }

  AppController.prototype.removeClient = function(clientCtr) {
    this.clients.removeClient(clientCtr);
  };

  // would be better to use a seperate derective
  function ClientController(client, logs) {
    this.client = client;
    this.topicName = 'emails/abc';
    this.message = null;
    this.msgs = [];
    this.logs = logs;
    var self = this;

    this.client.on('connectionLost', function () {
      self.logs.logError('Connection lost');
    });

    this.client.on('message',
      (function(client) {
        return (function (topic, payload) {
            var msg = {
              payloadString: payload.toString(),
              destinationName: topic
            };
            self.logs.log('message in ' + topic);
            self.msgs.push(new ReceivedMsg(msg));
            client.scope.$digest()
        });
      })(this.client)
    );

    this.client.on('error', function (arg) {
      self.logs.log('error');
      console.log('error');
      console.log(arg);
    });

    this.client.on('close', function (arg) {
      self.logs.log('close');
      console.log('close');
      console.log(arg);
    });

    this.client.on('offline', function (arg) {
      self.logs.log('offline');
      console.log('offline');
      console.log(arg);
    });

    this.client.on('connect', function (packet) {
      self.logs.log('connect');
      console.log('connect');
      console.log(packet);
    });

    this.client.on('reconnect', function (arg) {
      self.logs.log('reconnect');
      console.log('reconnect');
      console.log(arg);
    });

    this.client.on('subscribeFailed', function (e) {
      self.logs.logError('subscribeFailed ' + e);
    });

    this.client.on('subscribeSuccess', function (resp) {
      self.logs.log('Successfully subscribed to ' + resp.topics);
      console.log(resp);
    });

    this.client.on('publishFailed', function (e) {
      self.logs.log('publishFailed');
    });

  }

  ClientController.prototype.subscribe = function() {
    try{
      this.client.subscribe(
        this.topicName,
          (function(client) {
            return (function(err,pass){
              if(err){
                console.log("error in subscribe for client");
                console.log(err);
                console.log(client);
                client.emit("subscribeFailed");
                client.scope.$digest();
              }else if(pass){
                console.log("okay in subscribe for client");
                console.log(pass);
                console.log(client);
                var topics = (function() {
                  var i, len, results;
                  results = [];
                  for (i = 0, len = pass.length; i < len; i++) {
                    var o = pass[i];
                    results.push(o.topic);
                  }
                  return results;
                })();

                client.emit("subscribeSuccess", {topics: topics.join("\n") });
                client.scope.$digest();
              }
            });
          })(this.client)
      );
    }catch(e) {
      this.client.emit('subscribeFailed', e);
    }
  };

  ClientController.prototype.publish = function() {
    this.client.publish(
      this.topicName,
      this.message,
      {},
      (function(client) {
        return (function(err){
          if(err){
            console.log("error in publish for client");
            console.log(err);
            console.log(client);
            client.emit("publishFailed");
            client.scope.$digest();
          }
        });
      })(this.client)
    );
    //   } catch (e) {
    //     this.emit('publishFailed', e);
    //   }
  };

  ClientController.prototype.msgInputKeyUp = function($event) {
    if ($event.keyCode === 13) {
      this.publish();
    }
  };


  function ClientControllerCache(scope, logs){
    this.scope = scope;
    this.logs = logs;
    this.val = [];
  }

  ClientControllerCache.prototype.getClient = function(options) {
    var id = options.accessKey + '>' + options.clientId + '@' + options.endpoint;
    for (var i = 0; i < this.val.length; i++) {
      var ctr = this.val[i];
      if (ctr.id === id) {
        return ctr.client;
      }
    }
    if(options.type === "mqtt.js"){
      var client = mqtt.connect(options.mqttSvrUrl);
    }else{
      var client =  new MQTTClient(options, this.scope);
    }
    var clientController = new ClientController(client, this.logs);
    clientController.id = id;
    this.val.push(clientController);
    return client;
  };

  ClientControllerCache.prototype.removeClient = function(clientCtr) {
    clientCtr.client.disconnect();
    var index = this.val.indexOf(clientCtr);
    this.val.splice(index, 1);
  };

  angular.module('awsiot.sample', []).controller('AppController', AppController);
})();