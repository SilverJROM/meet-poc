import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElement as defineIonIcon } from 'ionicons/components/ion-icon.js';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

defineIonIcon();

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
