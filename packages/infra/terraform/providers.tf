provider "aws" {
  region = "ap-southeast-2"

  default_tags {
    tags = {
      Project     = "prompty-employed"
      ManagedBy   = "terraform"
      Environment = "production"
    }
  }
}
