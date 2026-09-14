from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.core.mail import send_mail
@receiver(post_save,sender=User)
def send_message(sender,instance,created,**kwargs):
    if created:
        subject="Accout Creation Success"
        message=f"Hey, {instance.username} , welcome to NepChat. Nepal's authentic chatting platform. We hope you enjoy your time."
        mail_from="abc@gmail.com"
        mail_to=[instance.email]
        send_mail(subject,message,mail_from,mail_to)
        print("Signal executed successfully!")
        print(f"Email sent to {instance.email} with subject: {subject}")
