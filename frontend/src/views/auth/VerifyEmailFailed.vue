<template>
  <auth-container>
    <h1 class="display-1">{{ $tc('views.auth.verifyEmailFailed.title') }}</h1>

    <v-alert type="error" class="my-4">
      {{ $tc('views.auth.verifyEmailFailed.failure') }}
    </v-alert>
    <v-spacer />
    <v-btn color="primary" :to="{name: 'home'}"
           x-large
           class="my-4" block>
      {{ $tc('views.auth.verifyEmailFailed.backToHome') }}
    </v-btn>
  </auth-container>
</template>

<script>
import AuthContainer from '@/components/layout/AuthContainer'

export default {
  name: 'VerifyEmailFailed',
  components: { AuthContainer }
}
</script>

<style>
</style>
