<template>
  <auth-container v-if="verifiedEmail">
    <h1 class="display-1">{{ $tc('views.auth.verifyEmail.title') }}</h1>

    <v-alert type="success" class="my-4 text--green text--darken-2">
      {{ $tc('views.auth.verifyEmail.success', 1, { email: verifiedEmail }) }}
    </v-alert>
    <v-spacer />
    <v-btn color="primary" :to="{name: 'login'}"
           x-large
           class="my-4" block>
      {{ $tc('views.auth.verifyEmail.loginNow') }}
    </v-btn>
  </auth-container>
</template>

<script>
import AuthContainer from '@/components/layout/AuthContainer'

export default {
  name: 'VerifyEmail',
  components: { AuthContainer },
  props: {
    token: { type: String, required: true }
  },
  data () {
    return {
      verifiedEmail: ''
    }
  },
  mounted () {
    this.api.href(this.api.get().auth(), 'verifyEmail', { token: this.token }).then(url => {
      this.api.post(url, {})
        .then(response => { this.verifiedEmail = response.verifiedEmail })
        .catch(() => { this.ready = true /* this.$router.push({ name: 'verify-email-failed' }) */ })
    })
  }
}
</script>

<style>
</style>
