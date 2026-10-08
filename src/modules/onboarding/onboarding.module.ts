import { Module } from '@nestjs/common';
import { OnboardingCtl } from './onboarding.controller';

@Module({
  controllers: [OnboardingCtl],
})
export class OnboardingModule {}
