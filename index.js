var apiquick = require('api-quick')

var Accessory, Service, Characteristic, hap, UUIDGen;

var FFMPEG = require('./ffmpeg').FFMPEG;

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-camera-ffmpeg", "Camera-ffmpeg", ffmpegPlatform, true);
}

function ffmpegPlatform(log, config, api) {
  var self = this;

  self.log = log;
  self.config = config || {};

  if (api) {
    self.api = api;

    if (api.version < 2.1) {
      throw new Error("Unexpected API version.");
    }

    self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
  }
}

ffmpegPlatform.prototype.configureAccessory = function(accessory) {
  // Won't be invoked
}

ffmpegPlatform.prototype.didFinishLaunching = function() {
  var self = this;
  var videoProcessor = self.config.videoProcessor || 'ffmpeg';
  var interfaceName = self.config.interfaceName || '';
  
  var motionAPIport = self.config.motionPort || 19999;
  
  self.endpoints = {"motion": {} };

  var motion_cb = function(req) {
    if(req.method ==='POST'){
      if (req.body.hasOwnProperty('motion')){
          try {
           this.getService(Service.MotionSensor).setCharacteristic(Characteristic.MotionDetected, parseInt(req.body.motion)?1:0);
          } catch(e) {
            console.log(e)
          }
      }
    }
  };

  if (self.config.cameras) {
    var configuredAccessories = [];

    var cameras = self.config.cameras;
    cameras.forEach(function(cameraConfig) {
      var cameraName = cameraConfig.name;
      var videoConfig = cameraConfig.videoConfig;

      if (!cameraName || !videoConfig) {
        self.log("Missing parameters.");
        return;
      }

      var uuid = UUIDGen.generate(cameraName);
      var cameraAccessory = new Accessory(cameraName, uuid, hap.Accessory.Categories.CAMERA);
      var cameraAccessoryInfo = cameraAccessory.getService(Service.AccessoryInformation);
      if (cameraConfig.manufacturer) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.Manufacturer, cameraConfig.manufacturer);
      }
      if (cameraConfig.model) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.Model, cameraConfig.model);
      }
      if (cameraConfig.serialNumber) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.SerialNumber, cameraConfig.serialNumber);
      }
      if (cameraConfig.firmwareRevision) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, cameraConfig.firmwareRevision);
      }

      cameraAccessory.context.log = self.log;
      cameraAccessory.context.MotionDetected = false;

      if (cameraConfig.motion) {
        var motion = new Service.MotionSensor(cameraName);
        cameraAccessory.addService(motion);
        
        self.endpoints.motion[cameraName] = motion_cb.bind(cameraAccessory)
      }

      var cameraSource = new FFMPEG(hap, cameraConfig, self.log, videoProcessor, interfaceName);
      cameraAccessory.configureCameraSource(cameraSource);
      configuredAccessories.push(cameraAccessory);
    });

    self.log("Hosting Motion API");
    apiquick.init(19999,{'rateLimit': {'period': 10,'limit': 5}}); // Max 5 calls in 10
    apiquick.addEndpoints(self.endpoints);
    
    self.api.publishCameraAccessories("Camera-ffmpeg", configuredAccessories);
  }
};

