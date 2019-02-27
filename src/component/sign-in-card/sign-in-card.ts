import {CommonUtilService} from './../../service/common-util.service';
import {Component, EventEmitter, Inject, Input, NgZone, Output} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {NavController} from 'ionic-angular';
import {AppVersion} from '@ionic-native/app-version';
import {
  ContainerService,
  Environment,
  InteractSubtype,
  InteractType,
  PageId,
  SharedPreferences,
  TelemetryService,
} from 'sunbird';
import {initTabs, LOGIN_TEACHER_TABS} from '../../app/module.service';
import {generateInteractTelemetry} from '../../app/telemetryutil';
import {ProfileConstants} from '../../app/app.constant';
import {FormAndFrameworkUtilService} from '../../pages/profile/formandframeworkutil.service';
import {
  ApiService,
  AuthService,
  OauthSession,
  OAuthSessionProvider,
  Profile,
  ProfileService,
  ProfileSource,
  ProfileType,
  SdkConfig,
  ServerProfileDetailsRequest
} from 'sunbird-sdk';

@Component({
  selector: 'sign-in-card',
  templateUrl: 'sign-in-card.html'
})

export class SignInCardComponent {

  private readonly DEFAULT_TEXT = [
    'OVERLAY_LABEL_COMMON',
    'OVERLAY_INFO_TEXT_COMMON'
  ];

  private translateDisplayText;

  appName = '';
  @Input() source = '';
  @Input() title = '';
  @Input() description = '';
  @Output() valueChange = new EventEmitter();

  constructor(
    @Inject('PROFILE_SERVICE') private profileService: ProfileService,
    @Inject('AUTH_SERVICE') private authService: AuthService,
    @Inject('API_SERVICE') private apiService: ApiService,
    @Inject('SDK_CONFIG') private sdkConfig: SdkConfig,
    public translate: TranslateService,
    public navCtrl: NavController,
    private container: ContainerService,
    private ngZone: NgZone,
    private telemetryService: TelemetryService,
    private appVersion: AppVersion,
    private sharedPreferences: SharedPreferences,
    private commonUtilService: CommonUtilService,
    private formAndFrameworkUtilService: FormAndFrameworkUtilService
  ) {

    this.appVersion.getAppName()
      .then((appName: any) => {
        this.appName = appName;
        this.initText();
      });
  }

  initText() {
    this.translate.get(this.DEFAULT_TEXT, {'%s': this.appName}).subscribe((value) => {
      this.translateDisplayText = value;
      if (this.title.length === 0) {
        this.title = 'OVERLAY_LABEL_COMMON';
      }

      if (this.description.length === 0) {
        this.description = 'OVERLAY_INFO_TEXT_COMMON';
      }
    });
  }

  singIn() {

    if (!this.commonUtilService.networkInfo.isNetworkAvailable) {
      this.valueChange.emit(true);
    } else {
      this.telemetryService.interact(
        generateInteractTelemetry(
          InteractType.TOUCH,
          InteractSubtype.SIGNIN_OVERLAY_CLICKED,
          Environment.HOME,
          this.source, null,
          undefined,
          undefined)
      );

      this.generateLoginInteractTelemetry(InteractType.TOUCH, InteractSubtype.LOGIN_INITIATE, '');

      const that = this;
      const loader = this.commonUtilService.getLoader();
      this.authService.setSession(new OAuthSessionProvider(this.sdkConfig.apiConfig, this.apiService))
        .toPromise()
        .then(() => {
          initTabs(that.container, LOGIN_TEACHER_TABS);
          return that.refreshProfileData();
        })
        .then(value => {
          return that.refreshTenantData(value.slug, value.title);
        })
        .then(() => {
          loader.dismiss();
          that.ngZone.run(() => {
            that.sharedPreferences.putString('SHOW_WELCOME_TOAST', 'true');
            window.location.reload();
            // TabsPage.prototype.ionVieit wWillEnter();
          });
        })
        .catch(error => {
          console.log(error);
          return loader.dismiss();
        });
    }
  }

  refreshProfileData() {
    const that = this;

    return new Promise<any>((resolve, reject) => {
      that.authService.getSession().toPromise()
        .then((session: OauthSession) => {
          if (session) {
            const req: ServerProfileDetailsRequest = {
              userId: session.userToken,
              requiredFields: ProfileConstants.REQUIRED_FIELDS
          };
            that.profileService.getServerProfilesDetails(req).toPromise()
              .then((success) => {
                that.generateLoginInteractTelemetry(InteractType.OTHER, InteractSubtype.LOGIN_SUCCESS, success.id);
                const profile: Profile = {
                  uid: success.id,
                  handle: success.id,
                  profileType: ProfileType.TEACHER,
                  source: ProfileSource.SERVER,
                  serverProfile: success
                };
                this.profileService.createProfile(profile, ProfileSource.SERVER)
                  .toPromise()
                  .then(() => {
                    that.profileService.setActiveSessionForProfile(profile.uid).toPromise()
                      .then(() => {
                        that.formAndFrameworkUtilService.updateLoggedInUser(success, profile)
                          .then(() => {
                            resolve({slug: success.rootOrg.slug, title: success.rootOrg.orgName});
                          }).catch(() => {
                          resolve({slug: success.rootOrg.slug, title: success.rootOrg.orgName});
                        }).catch((err) => {
                          reject(err);
                        });
                      }).catch((err) => {
                      console.log('err in setActiveSessionProfile in sign-in card --', err);
                    });
                  }).catch(() => {

              })
              }).catch((err) => {
              reject(err);
          });
        } else {
          reject('session is null');
        }
        })
    });
  }

  refreshTenantData(slug: string, title: string) {
    return new Promise((resolve, reject) => {
      this.profileService.getTenantInfo().toPromise()
        .then((value) => {
          (<any>window).splashscreen.setContent(title, value.logo);
          resolve();
        }).catch(() => {
        resolve(); // ignore
      })
    });
  }

  generateLoginInteractTelemetry(interactType, interactSubtype, uid) {
    const valuesMap = new Map();
    valuesMap['UID'] = uid;
    this.telemetryService.interact(
      generateInteractTelemetry(interactType,
        interactSubtype,
        Environment.HOME,
        PageId.LOGIN,
        valuesMap,
        undefined,
        undefined));
  }
}
