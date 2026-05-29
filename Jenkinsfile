// CI cho vietqr-worker — Jenkins + Docker-in-Docker.
// Cần credential 'vtc-registry-creds' + 'github-pat' (đã có trong Jenkins).
pipeline {
  agent {
    kubernetes {
      yaml '''
        apiVersion: v1
        kind: Pod
        spec:
          containers:
          - name: docker
            image: docker:27-cli
            command: ["sleep"]
            args: ["infinity"]
            env:
            - name: DOCKER_HOST
              value: tcp://localhost:2375
          - name: dind
            image: docker:27-dind
            securityContext:
              privileged: true
            env:
            - name: DOCKER_TLS_CERTDIR
              value: ""
      '''
    }
  }
  options { disableConcurrentBuilds() }
  environment {
    REGISTRY = "cr1.viettelcloud.vn/demo-test-thunta5-7t8wy7z0nx"
    IMAGE    = "haidm12-vietqr-worker"
    IMG_TAG  = "${GIT_COMMIT.take(8)}"
  }
  stages {
    stage('Build & Push') {
      steps {
        container('docker') {
          withCredentials([usernamePassword(credentialsId: 'vtc-registry-creds',
                                            usernameVariable: 'RU', passwordVariable: 'RP')]) {
            sh '''
              for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; echo "wait dockerd $i"; sleep 2; done
              echo "$RP" | docker login cr1.viettelcloud.vn -u "$RU" --password-stdin
              docker build -t ${REGISTRY}/${IMAGE}:${IMG_TAG} -t ${REGISTRY}/${IMAGE}:latest .
              docker push ${REGISTRY}/${IMAGE}:${IMG_TAG}
              docker push ${REGISTRY}/${IMAGE}:latest
            '''
          }
        }
      }
    }
    stage('Update GitOps') {
      steps {
        container('docker') {
          withCredentials([usernamePassword(credentialsId: 'github-pat',
                                            usernameVariable: 'GU', passwordVariable: 'GP')]) {
            sh '''
              apk add --no-cache git >/dev/null 2>&1 || true
              rm -rf jobvui-lms-infra
              git clone https://$GU:$GP@github.com/dinhmanhhai/jobvui-lms-infra.git
              cd jobvui-lms-infra
              sed -i "s|tag:.*|tag: ${IMG_TAG}|" charts/vietqr-worker/values.yaml
              git config user.email "ci@haidm12.cloud"
              git config user.name "jenkins"
              git commit -am "ci: vietqr-worker ${IMG_TAG}" || echo "no change"
              git push
            '''
          }
        }
      }
    }
  }
}
