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

  AppController.prototype.createClientPaho = function () {
    var options = {
      clientId: this.clientId,
      endpoint: this.endpoint.toLowerCase(),
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      regionName: this.regionName,
      sessionToken: this.sessionToken
    };
    var client = this.clients.getClient(options);
    if (!client.connected) {
      client.connect(options);
    }
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

    switch (this.client.constructor.name) {
      case "MqttClient":  // MQTT.js client

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
        this.client.on('connected', function () {
          self.logs.log('connected');
        });
        this.client.on('subscribeFailed', function (e) {
          self.logs.logError('subscribeFailed ' + e);
        });
        this.client.on('subscribeSucess', function () {
          self.logs.log('subscribeSucess');
        });
        this.client.on('publishFailed', function (e) {
          self.logs.log('publishFailed');
        });
        break;

      case "MQTTClient":  // Paho MQTT client

        this.client.on('connectionLost', function () {
          self.logs.logError('Connection lost');
        });
        this.client.on('messageArrived', function (msg) {
          self.logs.log('messageArrived in ' + self.id);
          self.msgs.push(new ReceivedMsg(msg));
        });
        this.client.on('connected', function () {
          self.logs.log('connected');
        });
        this.client.on('subscribeFailed', function (e) {
          self.logs.logError('subscribeFailed ' + e);
        });
        this.client.on('subscribeSucess', function () {
          self.logs.log('subscribeSucess');
        });
        this.client.on('publishFailed', function (e) {
          self.logs.log('publishFailed');
        });
    }

  }

  ClientController.prototype.subscribe = function() {
    this.client.subscribe(this.topicName);
  };

  ClientController.prototype.publish = function() {
    this.client.publish(this.topicName, this.message);
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

  /**
  * AWS IOT MQTT Client
  * @class MQTTClient
  * @param {Object} options - the client options
  * @param {string} options.endpoint
  * @param {string} options.regionName
  * @param {string} options.accessKey
  * @param {string} options.secretKey
  * @param {string} options.clientId
  * @param {angular.IScope}  [scope]  - the angular scope used to trigger UI re-paint, you can
  omit this if you are not using angular
  */
  function MQTTClient(options, scope){
    this.options = options;
    this.scope = scope;

    this.endpoint = this.computeUrl();
    this.clientId = options.clientId;
    this.name = this.clientId + '@' + options.endpoint;
    this.connected = false;
    this.client = new Paho.MQTT.Client(this.endpoint, this.clientId);
    this.listeners = {};
    var self = this;
    this.client.onConnectionLost = function() {
      self.emit('connectionLost');
      self.connected = false;
    };
    this.client.onMessageArrived = function(msg) {
      self.emit('messageArrived', msg);
    };
    this.on('connected', function(){
      self.connected = true;
    });
  }

  /**
   * compute the url for websocket connection
   * @private
   *
   * @method     MQTTClient#computeUrl
   * @return     {string}  the websocket url
   */
  MQTTClient.prototype.computeUrl = function(){
    // must use utc time
    var time = moment.utc();
    var dateStamp = time.format('YYYYMMDD');
    var amzdate = dateStamp + 'T' + time.format('HHmmss') + 'Z';
    var service = 'iotdevicegateway';
    var region = this.options.regionName;
    var secretKey = this.options.secretKey;
    var accessKey = this.options.accessKey;
    var algorithm = 'AWS4-HMAC-SHA256';
    var protocol = 'wss';
    // var host = 'data.iot.us-west-2.amazonaws.com';
    var host = this.options.endpoint;
    var canonicalUri = '/mqtt';
    var sessionToken  = this.options.sessionToken;

    //  function(protocol, host, uri, service, region, accessKey, secretKey, sessionToken)
    var requestUrl = SigV4Utils.getSignedUrl(protocol, host, canonicalUri,
      service, region, accessKey, secretKey, sessionToken);

    // console.log("v2 SigV4Utils requestUrl: " + requestUrl);
    return requestUrl;
  };

  /**
  * listen to client event, supported events are connected, connectionLost,
  * messageArrived(event parameter is of type Paho.MQTT.Message), publishFailed,
  * subscribeSucess and subscribeFailed
  * @method     MQTTClient#on
  * @param      {string}  event
  * @param      {Function}  handler
  */
  MQTTClient.prototype.on = function(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  };

  /** emit event
   *
   * @method MQTTClient#emit
   * @param {string}  event
   * @param {...any} args - event parameters
   */
  MQTTClient.prototype.emit = function(event) {
    var listeners = this.listeners[event];
    if (listeners) {
      var args = Array.prototype.slice.apply(arguments, [1]);
      for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        listener.apply(null, args);
      }
      // make angular to repaint the ui, remove these if you don't use angular
      if(this.scope && !this.scope.$$phase) {
        this.scope.$digest();
      }
    }
  };

  /**
   * connect to AWS, should call this method before publish/subscribe
   * @method MQTTClient#connect
   */
  MQTTClient.prototype.connect = function() {
    var self = this;
    var connectOptions = {
      onSuccess: function(){
        self.emit('connected');
      },
      useSSL: true,
      timeout: 3,
      mqttVersion:4,
      onFailure: function() {
        self.emit('connectionLost');
      }
    };
    this.client.connect(connectOptions);
  };

  /**
   * disconnect
   * @method MQTTClient#disconnect
   */
  MQTTClient.prototype.disconnect = function() {
    this.client.disconnect();
  };

  /**
   * publish a message
   * @method     MQTTClient#publish
   * @param      {string}  topic
   * @param      {string}  payload
   */
  MQTTClient.prototype.publish = function(topic, payload) {
    try {
      var message = new Paho.MQTT.Message(payload);
      message.destinationName = topic;
      this.client.send(message);
    } catch (e) {
      this.emit('publishFailed', e);
    }
  };

  /**
   * subscribe to a topic
   * @method     MQTTClient#subscribe
   * @param      {string}  topic
   */
  MQTTClient.prototype.subscribe = function(topic) {
    var self = this;
    try{
      this.client.subscribe(topic, {
        onSuccess: function(){
          self.emit('subscribeSucess');
        },
        onFailure: function(){
          self.emit('subscribeFailed');
        }
      });
    }catch(e) {
      this.emit('subscribeFailed', e);
    }

  };

  angular.module('awsiot.sample', []).controller('AppController', AppController);
})();